/* 
 * YORB 2020
 *
 * Aidan Nelson, April 2020
 *
 */


import { pauseAllConsumersForPeer, resumeAllConsumersForPeer, hackToRemovePlayerTemporarily } from './index.js'
import { PositionalAudioHelper } from './libs/PositionalAudioHelper.js';

const dat = require('dat.gui');
const THREE = require('./libs/three.min.js');
const Stats = require('./libs/stats.min.js');


// slightly awkward syntax, but these statements add these functions to THREE
require('./libs/GLTFLoader.js')(THREE);
require('./libs/pointerLockControls.js')(THREE);
require('./libs/PositionalAudioHelper.js')(THREE);
// const VolumetricFire = require('./libs/VolumetricFire.js')(THREE);

class Scene {
    constructor(
        _movementCallback,
        _clients,
        _music_streams,
        mySocketID) {

        // add this to window to allow javascript console debugging
        window.scene = this;

        // this pauses or restarts rendering and updating
        this.paused = true;
        let domElement = document.getElementById('scene-container');
        this.frameCount = 0;
        this.clients = _clients;
        this.musicStreams = _music_streams;
        this.mySocketID = mySocketID;
        this.hyperlinkedObjects = []; // array to store interactable hyperlinked meshes
        this.DEBUG_MODE = false;
        this.movementCallback = _movementCallback;
        this.width = (window.innerWidth);
        // this.width = (window.innerWidth * 0.9);
        // this.height = (window.innerHeight * 0.7);
        this.height = (window.innerHeight);
        this.scaleFactor = 1.5;
        this.gravity = true;
        this.scene = new THREE.Scene();
        this.raycaster = new THREE.Raycaster();
        this.textParser = new DOMParser;
        this.mouse = {
            x: 0,
            y: 0
        };
        this.hightlightedProjectId = -1; // to start
        this.textureLoader = new THREE.TextureLoader();
        this.serverMusicOffset = {};



        // audio variables:
        this.distanceThresholdSquared = 500;
        this.rolloffNumerator = 5;



        // STATS for debugging:
        this.stats = new Stats();
        document.body.appendChild(this.stats.dom);
        this.stats.dom.style = "visibility: hidden;";


        //THREE Camera
        this.cameraHeight = 2;
        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 5000);
        this.camera.zoom = 0.6;
        this.camera.fov = 40;
        this.camera.updateProjectionMatrix();

        this.gui = new dat.GUI({ autoPlace: false });
        var customContainer = document.getElementById('mini-map-box');
        customContainer.appendChild(this.gui.domElement);


        // starting position
        // elevator bank range: x: 3 to 28, z: -2.5 to 1.5
        let randX = this.randomRange(-2, 14);
        let randZ = this.randomRange(12, 16);
        this.camera.position.set(randX, this.cameraHeight, randZ);
        // create an AudioListener and add it to the camera
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        this.scene.add(this.camera);
        this.camera.lookAt(new THREE.Vector3(0, this.cameraHeight, 0));
        window.camera = this.camera;

        //THREE WebGL renderer
        this.renderer = new THREE.WebGLRenderer({
            antialiasing: true
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(new THREE.Color('lightblue'));
        this.renderer.setSize(this.width, this.height);

        this.setupControls();
        this.addLights();
        this.setupCollisionDetection();
        this.teleports = []; // Teleport setup
        this.createMaterials();
        this.loadBackground();
        this.loadFloorModel();
        // this.loadFire();
        this.createGui();

        //this.setupSpringShow();

        //Push the canvas to the DOM
        domElement.append(this.renderer.domElement);

        //Setup event listeners for events and handle the states
        window.addEventListener('resize', e => this.onWindowResize(e), false);
        domElement.addEventListener('click', e => this.onMouseClick(e), false);

        // Helpers
        //this.helperGrid = new THREE.GridHelper(500, 500);
        //this.helperGrid.position.y = -0.1; // offset the grid down to avoid z fighting with floor
        //this.scene.add(this.helperGrid);

        this.update();
        this.render();
    }


    createGui() {
        // this.gui.add(this.ambient_light, 'intensity', 0.01, 2.01, 1).name('Brillo');
        this.gui.add(this.ambient_light, 'intensity', 1).name('Brillo');
        this.music_volume = 100;
        let musicStreams = this.musicStreams;
        this.gui.add(this, 'music_volume', 0, 200, 10).name('Vol. Música').onChange(
            function(v) {
                let keys = Object.keys(musicStreams);
                for (let i = 0; i < keys.length; i++) {
                    var ms = musicStreams[keys[i]];
                    ms.audio.setVolume(ms.gain * v / 100);
                }
            }
        );
    }


    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Lighting 💡

    addLights() {
        // add some lights
        this.ambient_light = new THREE.AmbientLight(0xe6ffe6, 0.8)
        this.scene.add(this.ambient_light);

        //https://github.com/mrdoob/three.js/blob/master/examples/webgl_lights_hemisphere.html
        //// main sunlight with shadows
        //let dirLight = new THREE.DirectionalLight(0xffffe6, 0.7);
        //dirLight.color.setHSL(0.1, 1, 0.95);
        //dirLight.position.set(- 1, 0.5, -1);
        //dirLight.position.multiplyScalar(200);
        //this.scene.add(dirLight);

        //dirLight.castShadow = true;
        //dirLight.shadow.mapSize.width = 1024;
        //dirLight.shadow.mapSize.height = 1024;

        //var d = 150;
        //dirLight.shadow.camera.left = - d;
        //dirLight.shadow.camera.right = d;
        //dirLight.shadow.camera.top = d;
        //dirLight.shadow.camera.bottom = - d;

        //dirLight.shadow.camera.far = 3500;
        //dirLight.shadow.bias = - 0.0001;

        //// secondary directional light without shadows:
        //let dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
        //dirLight2.color.setHSL(0.1, 1, 0.95);
        //dirLight2.position.set(1, 0.5, -1);
        //dirLight2.position.multiplyScalar(200);
        //this.scene.add(dirLight2);

        //let hemiLight = new THREE.HemisphereLight(0x10537d, 0xb97a20, 1 );
        //hemiLight.color.setHSL( 0.6, 1, 0.6 );
        //hemiLight.groundColor.setHSL( 0.095, 1, 0.75 );
        //hemiLight.position.set( 0, 3, 0 );
        //this.scene.add( hemiLight );

        //let hemiLightHelper = new THREE.HemisphereLightHelper( hemiLight, 10 );
        //this.scene.add( hemiLightHelper );

        //
        let lightScene = new THREE.Group();

        //let dirLightTarget = new THREE.Vector3(10, 3, 1);
        //let dirLightDir = new THREE.Vector3(1, 0, -.1).normalize();
        //let dirLightDistance = 10; 
        //let dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
        //dirLight.color.setHSL( 0.1, 1, 0.95 );
        //
        //dirLight.position.set(dirLightTarget.add(dirLightDir.multiplyScalar(dirLightDistance)));
        //dirLight.target.position.set( 10, 3, 1 );
        //dirLight.position.multiplyScalar( 30 );

        //dirLight.castShadow = true; 

        //var d = 50;

        //dirLight.shadow.camera.left = - d;
        //dirLight.shadow.camera.right = d;
        //dirLight.shadow.camera.top = d;
        //dirLight.shadow.camera.bottom = - d;

        //dirLight.shadow.camera.far = 3500;
        //dirLight.shadow.bias = - 0.0001;

        //let dirLightHelper = new THREE.DirectionalLightHelper(dirLight);
        //lightScene.add( dirLight );
        //lightScene.add( dirLight.target );
        //lightScene.add( dirLightHelper );


        let luzCuadroCocina = new THREE.PointLight(0xe4dfdc, 0.1);
        luzCuadroCocina.position.set(0.5, 1.7, -6.4);
        luzCuadroCocina.decay = 1.5;
        luzCuadroCocina.power = 10;
        luzCuadroCocina.distance = 6;
        // lightScene.add(luzCuadroCocina);
        //makePointLightGUI(lightScene, this.gui, luzCuadroCocina, 'cuadro_cocina');

        let luzMesitaCocina = new THREE.PointLight(0xFFE587, 0.3);
        luzMesitaCocina.position.set(3, 1, -8.6)
        luzMesitaCocina.decay = 3;
        luzMesitaCocina.power = 15;
        luzMesitaCocina.distance = 3;
        // lightScene.add(luzMesitaCocina);
        //makePointLightGUI(lightScene, this.gui, luzMesitaCocina, 'mesita_cocina');

        let luzAulita = new THREE.PointLight(0x1e224a, 0.3);
        luzAulita.position.set(5.9, 1.7, -8.8)
        luzAulita.decay = 2;
        luzAulita.power = 80;
        luzAulita.distance = 8;
        // lightScene.add(luzAulita);

        //let luzMesitaCocina = new THREE.SpotLight(0xFFE587, 0.3);
        //luzMesitaCocina.position.set(2.8, 1, -8.6)
        //luzMesitaCocina.decay = 5;
        //luzMesitaCocina.power = 4;
        //luzMesitaCocina.distance = 3;
        //luzMesitaCocina.angle = 1.2;
        //luzMesitaCocina.target.position.set(5, 1, -8.6)
        //luzMesitaCocina.target.updateMatrixWorld();
        //lightScene.add(luzMesitaCocina);
        //lightScene.add(luzMesitaCocina.target);

        let luzMesitaBano = new THREE.PointLight(0xFFE587, 0.3);
        luzMesitaBano.position.set(5.2, 0.8, -4.5)
        luzMesitaBano.decay = 1;
        luzMesitaBano.power = 10;
        luzMesitaBano.distance = 3;
        // lightScene.add(luzMesitaBano);
        //lightScene.add(luzMesitaBano.target);

        //let luzExterior = new THREE.PointLight(0xFFE587, 0.3);
        //luzExterior.position.set(2.1, 3.3, 1.2);
        //luzExterior.distance = 5;
        //luzExterior.power = 1;
        //luzExterior.decay = 0.2;
        //lightScene.add(luzExterior);

        let luzArbolAngle = 0.4
        let luzArbolPenumbra = 0.3

        let luzArbolSO = new THREE.SpotLight(0xbf8a18, 0.3);
        luzArbolSO.position.set(15.2, 15, 8);
        luzArbolSO.target.position.set(15.2, 0, 8)
        luzArbolSO.distance = 50;
        luzArbolSO.power = 10;
        luzArbolSO.decay = 1;
        luzArbolSO.angle = luzArbolAngle;
        luzArbolSO.penumbra = luzArbolPenumbra;
        lightScene.add(luzArbolSO);
        lightScene.add(luzArbolSO.target);
        //makeSpotLightGUI(lightScene, this.gui, luzArbolSO, 'arbolSO');

        let luzArbolSE = new THREE.SpotLight(0x43ba81, 0.3);
        luzArbolSE.position.set(-11.2, 15, 13.6);
        luzArbolSE.target.position.set(-11.2, 0, 13.6)
        luzArbolSE.distance = 50;
        luzArbolSE.power = 10;
        luzArbolSE.decay = 1;
        luzArbolSE.angle = luzArbolAngle;
        luzArbolSE.penumbra = luzArbolPenumbra;
        lightScene.add(luzArbolSE);
        lightScene.add(luzArbolSE.target);
        //makeSpotLightGUI(lightScene, this.gui, luzArbolSE, 'arbolSE');

        let luzArbolNE = new THREE.SpotLight(0x9843b5, 0.3);
        luzArbolNE.position.set(18, 15, -12);
        luzArbolNE.target.position.set(23, 0, -17)
        luzArbolNE.distance = 50;
        luzArbolNE.power = 10;
        luzArbolNE.decay = 1;
        luzArbolNE.angle = luzArbolAngle;
        luzArbolNE.penumbra = luzArbolPenumbra;
        lightScene.add(luzArbolNE);
        lightScene.add(luzArbolNE.target);
        //makeSpotLightGUI(lightScene, this.gui, luzArbolNE, 'arbolNE');

        let luzArbolNO = new THREE.SpotLight(0xbf4618, 0.3);
        luzArbolNO.position.set(-9.6, 15, -16.8);
        luzArbolNO.target.position.set(-9.6, 0, -16.8)
        luzArbolNO.distance = 50;
        luzArbolNO.power = 10;
        luzArbolNO.decay = 1;
        luzArbolNO.angle = luzArbolAngle;
        luzArbolNO.penumbra = luzArbolPenumbra;
        lightScene.add(luzArbolNO);
        lightScene.add(luzArbolNO.target);
        //makeSpotLightGUI(lightScene, this.gui, luzArbolNO, 'arbolNO');

        let luzCalle = new THREE.SpotLight(0xF7FBFF, 0.3);
        luzCalle.position.set(10, 8, 6);
        luzCalle.target.position.set(1.8, -3, 0.81);
        luzCalle.distance = 30;
        luzCalle.power = 3;
        luzCalle.decay = 1;
        luzCalle.angle = 0.34;
        luzCalle.penumbra = 0.3;
        // lightScene.add(luzCalle);
        // lightScene.add(luzCalle.target);
        //makeSpotLightGUI(lightScene, this.gui, luzCalle, 'calle');

        let luzTerrazaNE = new THREE.SpotLight(0xFFFFFF, 0.3);
        luzTerrazaNE.position.set(-0.5, 15, -11);
        luzTerrazaNE.distance = 20;
        luzTerrazaNE.power = 5;
        luzTerrazaNE.decay = 2;
        luzTerrazaNE.target.position.set(15, 0, 20)
        lightScene.add(luzTerrazaNE);
        lightScene.add(luzTerrazaNE.target);

        let luzTerrazaSE = new THREE.SpotLight(0xFFFFFF, 0.3);
        luzTerrazaSE.position.set(-0.5, 15, -0.5);
        luzTerrazaSE.distance = 10;
        luzTerrazaSE.power = 5;
        luzTerrazaSE.decay = 1;
        lightScene.add(luzTerrazaSE);
        lightScene.add(luzTerrazaSE.target);

        let luzTerrazaSO = new THREE.SpotLight(0xFFFFFF, 0.3);
        luzTerrazaSO.position.set(7.5, 15, -0.5);
        luzTerrazaSO.distance = 10;
        luzTerrazaSO.power = 5;
        luzTerrazaSO.decay = 1;
        lightScene.add(luzTerrazaSO);
        lightScene.add(luzTerrazaSO.target);

        let luzPortal = new THREE.PointLight(0xad3eff, 0.3);
        luzPortal.position.set(4.67, 1.5, -3.7);
        luzPortal.distance = 3;
        luzPortal.power = 10;
        luzPortal.decay = 2;
        lightScene.add(luzPortal);

        //makeSpotLightGUI(this.scene, this.gui, luzMesitaCocina, 'cocina');
        //makePointLightGUI(this.scene, this.gui, luzMesitaBano, 'bano');
        //makePointLightGUI(this.scene, this.gui, luzCalle, 'calle');
        //makeLightGUI(this.scene, gui, luzTerrazaNE, 'NE');
        //makeLightGUI(this.scene, gui, luzTerrazaSE, 'SE');
        //makeLightGUI(this.scene, gui, luzTerrazaSO, 'SO');
        //makeLightGUI(this.scene, gui, luzPortal, 'portal');

        //let luzTechoTerraza = new THREE.SpotLight(0xffffff, 0.6);
        //luzTechoTerraza.position.set(4.9, 6.14, -2.57);
        //luzTechoTerraza.distance = 10;
        //luzTechoTerraza.target.position.set(3.8, 9.4, 5.2);
        //lightScene.add(luzTechoTerraza);
        //lightScene.add(luzTechoTerraza.target);
        //makeSpotLightGUI(this.scene, this.gui, luzTechoTerraza, 'terraza');

        lightScene.scale.set(this.scaleFactor, this.scaleFactor, this.scaleFactor);
        this.scene.add(lightScene);
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Model 🏗

    loadBackground() {
        var path = 'models/lopez/fondo-';
        // var path = 'models/fogon/comunidad-';
        // var format = '.png';
        // var format = '.jpg';
        var format = '-dark.jpg';
        //var path = 'models/Park2/';
        // var format = '-dark.jpg';
        this.envMap = new THREE.CubeTextureLoader().load([
            // path + 'px' + format, path + 'nx' + format, // x
            // path + 'py' + format, path + 'ny' + format, // y
            // path + 'pz' + format, path + 'nz' + format, // z
            path + 'posy' + format, path + 'negy' + format, // y
            path + 'posz' + format, path + 'negz' + format, // z
            path + 'posx' + format, path + 'negx' + format, // x
        ]);
        //this.envMap.magFilter = THREE.NearestFilter;
        //this.envMap.minFilter = THREE.NearestFilter;
        this.scene.background = this.envMap;
    }

    loadFlatTexture(_file, repeatX, repeatY, flipY) {
        repeatX = repeatX || 1;
        repeatY = repeatY || 1;
        if (flipY === undefined) {
            flipY = true;
        }
        let texture = new THREE.TextureLoader().load(_file);
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearFilter
        texture.repeat.set(repeatX, repeatY);
        texture.flipY = flipY;
        return texture;
    }

    // this method instantiates materials for various parts of the ITP floor model
    // wall, ceiling, floor
    createMaterials() {
        //this.testMaterial = new THREE.MeshLambertMaterial({ color: 0xffff1a });

        //this.linkMaterial = new THREE.MeshLambertMaterial({ color: 0xb3b3ff });
        //this.linkVisitedMaterial = new THREE.MeshLambertMaterial({ color: 0x6699ff });
        //this.statusBoxMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });

        //// wall material:
        //this.wallMaterial = new THREE.MeshPhongMaterial({
        //    color: 0xfdfdfd,
        //);

        //// ceiling material
        //this.ceilingMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

        //// floor material
        //// https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_variations_phong.html
        //let floorTexture = new THREE.TextureLoader().load("textures/floor.jpg");
        //floorTexture.wrapS = THREE.RepeatWrapping;
        //floorTexture.wrapT = THREE.RepeatWrapping;
        //floorTexture.repeat.set(1, 1);

        //this.floorMaterial = new THREE.MeshLambertMaterial({
        //    color: 0xffffff,
        //    map: floorTexture
        //});
        //
        //this.paintedMetalMaterial = new THREE.MeshLambertMaterial({
        //    color: 0x1a1a1a,
        //    flatShading: true,
        //});

        //this.windowShelfMaterial = new THREE.MeshLambertMaterial({
        //    color: 0x565656
        //});

        //// https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_physical_transparency.html
        //this.glassMaterial = new THREE.MeshLambertMaterial({
        //    color: 0xD9ECFF,
        //    transparent: true,
        //    opacity: 0.25,
        //});


        //this.lightHousingMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });

        //this.lightDiffuserMaterial = new THREE.MeshLambertMaterial({
        //    color: 0xcccccc
        //});

        //this.glassFixturingMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
        //this.graniteBarMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
        // this.testMaterial = new THREE.MeshLambertMaterial({ color: 0xffff1a });

        // this.linkMaterial = new THREE.MeshLambertMaterial({ color: 0xb3b3ff });
        // this.linkVisitedMaterial = new THREE.MeshLambertMaterial({ color: 0x6699ff });



        let paintedRoughnessTexture = new THREE.TextureLoader().load("textures/roughness.jpg");
        paintedRoughnessTexture.wrapS = THREE.RepeatWrapping;
        paintedRoughnessTexture.wrapT = THREE.RepeatWrapping;
        paintedRoughnessTexture.repeat.set(5, 5);

        // // wall material:
        this.wallMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffe6,
            bumpMap: paintedRoughnessTexture,
            bumpScale: 0.25,
            specular: 0xfffff5,
            reflectivity: 0.01,
            shininess: 0.1,
            envMap: null
        });

        this.wallMaterial = new THREE.MeshLambertMaterial({
            color: 0xe3dfde
        });

        // // ceiling material
        // this.ceilingMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });

        // // floor material
        // // https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_variations_phong.html
        // let floorTexture = new THREE.TextureLoader().load("textures/floor.jpg");
        // floorTexture.wrapS = THREE.RepeatWrapping;
        // floorTexture.wrapT = THREE.RepeatWrapping;
        // floorTexture.repeat.set(1, 1);

        // this.floorMaterial = new THREE.MeshPhongMaterial({
        //     color: 0xffffff,
        //     map: floorTexture,
        //     bumpMap: floorTexture,
        //     bumpScale: 0.005,
        //     specular: 0xffffff,
        //     reflectivity: 0.5,
        //     shininess: 4,
        //     envMap: null
        // });

        // this.paintedMetalMaterial = new THREE.MeshPhongMaterial({
        //     color: 0x1a1a1a,
        //     bumpMap: paintedRoughnessTexture,
        //     bumpScale: 0.2,
        //     specular: 0xffffff,
        //     reflectivity: 0.01,
        //     shininess: 1,
        //     envMap: null
        // });

        // this.windowShelfMaterial = new THREE.MeshPhongMaterial({
        //     color: 0xdddddd
        // });

        // // https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_physical_transparency.html
        // this.glassMaterial = new THREE.MeshPhysicalMaterial({
        //     color: 0xD9ECFF,
        //     metalness: 0.05,
        //     roughness: 0,
        //     alphaTest: 0.5,
        //     depthWrite: false,
        //     envMap: this.envMap,
        //     envMapIntensity: 1,
        //     transparency: 1, // use material.transparency for glass materials
        //     opacity: 1,                        // set material.opacity to 1 when material.transparency is non-zero
        //     transparent: true
        // });

        // this.lightHousingMaterial = new THREE.MeshPhongMaterial({ color: 0x111111 });

        // this.lightDiffuserMaterial = new THREE.MeshPhongMaterial({
        //     color: 0xcccccc,
        //     emissive: 0xffffff,
        //     emissiveIntensity: 10,
        //     specular: 0xffffff,
        //     reflectivity: 0.01,
        //     shininess: 1,
        //     envMap: null
        // });

        // this.glassFixturingMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
        // this.graniteBarMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });

        // Lopez
        //

        let brickTexture = new THREE.TextureLoader().load("textures/patron_ladrillo.jpg");
        brickTexture.wrapS = THREE.MirrorRepeatWrapping;
        brickTexture.wrapT = THREE.MirrorRepeatWrapping;
        brickTexture.magFilter = THREE.LinearFilter
        brickTexture.minFilter = THREE.LinearFilter
        brickTexture.repeat.set(4, 8);

        this.brickMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: brickTexture
        });


        this.portalMaterial = new THREE.MeshLambertMaterial({
            map: this.loadFlatTexture('textures/crazy_place_portal.jpg'),
        });

        this.piso_cocina_material = new THREE.MeshPhongMaterial({
            color: 0x5d2c1b
        });
        this.piso_entrada_material = new THREE.MeshLambertMaterial({
            color: 0x9B8D4F
        });
        this.piso_aulita_material = new THREE.MeshLambertMaterial({
            color: 0xFBEAB4
        });

        this.cuadro_azul_material = new THREE.MeshPhongMaterial({
            //color: 0x254AF0,
            //color: 0xffffff,
            map: this.loadFlatTexture('textures/pared_cuadro_azul_f.jpg')
        });
        this.cuadro_rojo_material = new THREE.MeshPhongMaterial({
            //color: 0xD90300,
            //color: 0xffffff,
            map: this.loadFlatTexture('textures/pared_cuadro_rojo.jpg')
        });

        let textura_pared_aulita = this.loadFlatTexture('textures/pared_aulita.jpg')
        textura_pared_aulita.flipY = false;
        this.pared_aulita_material = new THREE.MeshPhongMaterial({
            //color: 0xD90300,
            //color: 0xffffff,
            map: textura_pared_aulita
        });
        this.biblioteca_material = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: this.loadFlatTexture('textures/biblioteca.jpg')
        });
        this.lavadero_material = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: this.loadFlatTexture('textures/lavadero.jpg')
        });
        this.cocina_material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            map: this.loadFlatTexture('textures/cocina.jpg')
        });

        this.piso_jardin_material = new THREE.MeshLambertMaterial({
            color: 0xBAB7B5
        });
        this.pasto_material = new THREE.MeshLambertMaterial({
            color: 0x17C223
        });
        this.reja_material = new THREE.MeshLambertMaterial({
            color: 0x084EBF
        });

        let pasto_texture = new THREE.TextureLoader().load('textures/pasto_ext.jpg');
        pasto_texture.wrapS = THREE.MirroredRepeatWrapping;
        pasto_texture.wrapT = THREE.MirroredRepeatWrapping;
        pasto_texture.repeat.set(40, 40);
        this.pasto_exterior_material = new THREE.MeshPhongMaterial({
            map: pasto_texture
        });
        // CUSTOM
        let arena_texture = new THREE.TextureLoader().load('textures/arena.png');
        arena_texture.wrapS = THREE.MirroredRepeatWrapping;
        arena_texture.wrapT = THREE.MirroredRepeatWrapping;
        arena_texture.repeat.set(40, 40);
        this.arena_material = new THREE.MeshPhongMaterial({
            map: arena_texture
        });
        this.copa_arbol_material = new THREE.MeshLambertMaterial({
            color: 0x318C23
        });
        this.tallo_arbol_material = new THREE.MeshLambertMaterial({
            color: 0x8C6F56
        });

        this.cartel_fiesta_material = new THREE.MeshLambertMaterial({
            map: this.loadFlatTexture('textures/cartel_fiesta.png', 1, 1, false)
        });
        this.cartel_terraza_material = new THREE.MeshLambertMaterial({
            map: this.loadFlatTexture('textures/cartel_terraza.png', 1, 1, false)
        });
        this.cartel_techo_terraza = new THREE.MeshBasicMaterial({
            map: this.loadFlatTexture('textures/qr_terraza.jpg', 1, 1, false)
        });
    }

    loadModelGltf(_file, _material, _scale, _castShadow, _receiveShadow, _collidable = false) {
        this.GLTFLoader.load(_file, (gltf) => {
            let scene = gltf.scene;
            scene.position.set(0, 0, 0);
            scene.scale.set(_scale, _scale, _scale);
            scene.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = _castShadow;
                    child.receiveShadow = _receiveShadow;
                }
            });
            this.scene.add(scene);
            let name = _file.slice(11, _file.indexOf("."));
            scene.name = name;
            this.floorModelParts.push(scene);
        }, undefined, function(e) {
            console.error(e);
        });
    }

    // loadFire() {
    //     var fireWidth = 2;
    //     var fireHeight = 4;
    //     var fireDepth = 2;
    //     var sliceSpacing = 0.5;

    //     var fire = new VolumetricFire(
    //         fireWidth,
    //         fireHeight,
    //         fireDepth,
    //         sliceSpacing,
    //         camera
    //     );
    //     fire.mesh.position.set(0, fireHeight / 2, 0);
    //     this.scene.add(fire.mesh);
    // }

    loadModel(_file, _material, _scale, _castShadow, _receiveShadow, _collidable = false) {
        this.GLTFLoader.load(_file, (gltf) => {
            let scene = gltf.scene;
            scene.position.set(0, 0, 0);
            scene.scale.set(_scale, _scale, _scale);
            scene.traverse((child) => {
                if (child.isMesh) {
                    child.material = _material;
                    child.castShadow = _castShadow;
                    child.receiveShadow = _receiveShadow;
                    if (_collidable) {
                        child.updateMatrixWorld();
                        this.collidableMeshList.push(child);
                    }
                }
            });
            this.scene.add(scene);
            let name = _file.slice(11, _file.indexOf("."));
            scene.name = name;
            this.floorModelParts.push(scene);
        }, undefined, function(e) {
            console.error(e);
        });
    }

    loadTeleport(_teleport_in, _teleport_out, _scale) {
        let teleport_ins = new Array();
        let teleport_outs = new Array();
        this.GLTFLoader.load(_teleport_out, (gltf) => {
            let scene = gltf.scene;
            scene.position.set(0, 0, 0);
            scene.scale.set(_scale, _scale, _scale);
            scene.traverse((child) => {
                if (child.isMesh) {
                    child.material.visible = false;
                    teleport_outs.push(child);
                }
            });
            this.scene.add(scene);
            scene.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.computeBoundingBox();
                }
            });
            if (teleport_outs.length > 1) {
                console.log('Could not load teleport (' + _teleport_in + ', ' +
                    _teleport_out + ') because out model has too many children.')
                return;
            }
            this.GLTFLoader.load(_teleport_in, (gltf) => {
                let scene = gltf.scene;
                scene.position.set(0, 0, 0);
                scene.scale.set(_scale, _scale, _scale);
                scene.traverse((child) => {
                    if (child.isMesh) {
                        teleport_ins.push(child);
                        child.material.visible = false;
                        //this.scene.add(new THREE.BoxHelper(child));
                    }
                });
                this.scene.add(scene);
                var teleport = { 'ins': teleport_ins, 'out': teleport_outs[0] }
                this.teleports.push(teleport);
            }, undefined, function(e) {
                console.error(e);
            });
        }, undefined, function(e) {
            console.error(e);
        });
    }

    loadFloorModel() {
        this.GLTFLoader = new THREE.GLTFLoader();
        let scaleFactor = this.scaleFactor;
        this.floorModelParts = [];
        this.matMode = 0;

        //this.loadModel('models/itp/ceiling.glb', this.ceilingMaterial, scaleFactor, true, false);
        //this.loadModel('models/itp/floor.glb', this.floorMaterial, scaleFactor, false, true, true);
        //this.loadModel('models/itp/glass-fixturing.glb', this.glassFixturingMaterial, scaleFactor, true, false);
        //this.loadModel('models/itp/glass.glb', this.glassMaterial, scaleFactor, false, false, true);
        //this.loadModel('models/itp/granite-bar.glb', this.graniteBarMaterial, scaleFactor, true, false, true);
        //this.loadModel('models/itp/ibeam.glb', this.paintedMetalMaterial, scaleFactor, true, false, true);
        // this.loadModel('models/itp/light-diffuser.glb', this.lightDiffuserMaterial, scaleFactor, false, false);
        // this.loadModel('models/itp/light-housing.glb', this.lightHousingMaterial, scaleFactor, false, false);
        // this.loadModel('models/itp/lighting-grid.glb', this.wallMaterial, scaleFactor, false, false);
        //this.loadModel('models/itp/walls.glb', this.wallMaterial, scaleFactor, true, false, true);
        this.loadModel('models/lopez/paredes.glb', this.wallMaterial, scaleFactor, true, true, true);
        this.loadModel('models/lopez/ladrillos.glb', this.brickMaterial, scaleFactor, false, false, false);
        this.loadModel('models/lopez/piso_aulita.glb', this.piso_aulita_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/piso_cocina.glb', this.piso_cocina_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/piso_entrada.glb', this.piso_entrada_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/paredes_ascensor.glb', this.wallMaterial, scaleFactor, false, false, true);

        this.loadModel('models/lopez/biblioteca.glb', this.biblioteca_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/lavadero.glb', this.lavadero_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/cocina.glb', this.cocina_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/cuadro_azul.glb', this.cuadro_azul_material, scaleFactor, false, false, false);
        this.loadModel('models/lopez/cuadro_rojo.glb', this.cuadro_rojo_material, scaleFactor, false, false, false);
        this.loadModel('models/lopez/pared_aulita.glb', this.pared_aulita_material, scaleFactor, false, false, false);

        this.loadModel('models/lopez/piso_entrada.glb', this.piso_jardin_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/pasto.glb', this.pasto_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/piso_jardin.glb', this.piso_jardin_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/reja.glb', this.reja_material, scaleFactor, true, false, true);

        this.loadModel('models/lopez/terraza.glb', this.wallMaterial, scaleFactor, true, false, true);
        this.loadModel('models/lopez/piso_terraza.glb', this.piso_cocina_material, scaleFactor, false, false, true);
        //this.loadModel('models/itp/window-shelf.glb', this.windowShelfMaterial, scaleFactor, true, false);
        //this.loadModel('models/itp/wooden-bar.glb', this.floorMaterial, scaleFactor, true, true, true);
           //this.loadModel('models/lopez/ascensor_in.glb', this.pasto_material, scaleFactor, false, false, false);
        // Elevators
        this.loadTeleport('models/lopez/ascensor_in.glb', 'models/lopez/ascensor_out.glb', scaleFactor);
        this.loadModel('models/lopez/ascensor_frente.glb', this.portalMaterial, scaleFactor, false, false, false);
        // Exterior
        this.loadModel('models/lopez/copas_arboles.glb', this.copa_arbol_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/tallos_arboles.glb', this.tallo_arbol_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/pasto_ext.glb', this.pasto_exterior_material, scaleFactor, false, false, true);
        this.loadModel('models/lopez/nuevo-pasto-ext2.glb', this.pasto_exterior_material, scaleFactor, false, false, true);
        //this.loadModel('models/lopez/nuevo-pasto-ext2.glb', this.arena_material, scaleFactor, false, false, true);


        this.loadModel('models/lopez/cartel_fiesta.glb', this.cartel_fiesta_material, scaleFactor, false, false, false);
        this.loadModel('models/lopez/cartel_terraza.glb', this.cartel_terraza_material, scaleFactor, false, false, false);
        this.loadModel('models/lopez/techo_terraza.glb', this.cartel_techo_terraza, scaleFactor, false, false, false);
        //this.loadModelGltf('models/fogon/Campfire.gltf', null, scaleFactor, false, false, true);

    }

    swapMaterials() {
        this.matMode++;
        if (this.matMode >= 3) {
            this.matMode = 0;
        }
        switch (this.matMode) {

            case 0:
                for (let i = 0; i < this.floorModelParts.length; i++) {
                    let scene = this.floorModelParts[i];
                    let mat = this.getMatFromName(scene.name);
                    scene.traverse((child) => {
                        if (child.isMesh) {
                            child.material = mat;
                        }
                    });
                }
                break;

            case 1:
                for (let i = 0; i < this.floorModelParts.length; i++) {
                    let scene = this.floorModelParts[i];
                    if (scene.name == "floor" || scene.name == "glass") {
                        continue;
                    } else {
                        scene.traverse((child) => {
                            if (child.isMesh) {
                                // https://stackoverflow.com/questions/43088424/setting-random-color-for-each-face-in-threejs-results-in-black-object
                                let col = new THREE.Color(0xffffff);
                                col.setHex(Math.random() * 0xffffff);
                                let mat = new THREE.MeshLambertMaterial({ color: col });
                                child.material = mat;

                            }
                        });
                    }

                }
                break;

            case 2:
                for (let i = 0; i < this.floorModelParts.length; i++) {
                    let scene = this.floorModelParts[i];
                    if (scene.name == "floor" || scene.name == "glass") {
                        continue;
                    } else {
                        scene.traverse((child) => {
                            if (child.isMesh) {
                                // https://stackoverflow.com/questions/43088424/setting-random-color-for-each-face-in-threejs-results-in-black-object
                                let col = new THREE.Color(0xffffff);
                                col.setHex(Math.random() * 0xffffff);
                                let mat = new THREE.MeshPhongMaterial({
                                    color: col,
                                    reflectivity: 0.4,
                                    shininess: 1,
                                    envMap: this.envMap
                                });
                                child.material = mat;

                            }
                        });
                    }

                }
                break;

        }
    }


    getMatFromName(name) {
        let mat = null;
        switch (name) {
            case "ceiling":
                mat = this.ceilingMaterial;
                break;
            case "floor":
                mat = this.floorMaterial;
                break;
            case "glass-fixturing":
                mat = this.glassFixturingMaterial;
                break;
            case "glass":
                mat = this.glassMaterial;
                break;
            case "granite-bar":
                mat = this.graniteBarMaterial;
                break;
            case "ibeam":
                mat = this.paintedMetalMaterial;
                break;
            case "light-diffuser":
                mat = this.lightDiffuserMaterial;
                break;
            case "light-housing":
                mat = this.lightHousingMaterial;
                break;
            case "lighting-grid":
                mat = this.wallMaterial;
                break;
            case "walls":
                mat = this.wallMaterial;
                break;
            case "window-shelf":
                mat = this.windowShelfMaterial;
                break;
            case "wooden-bar":
                mat = this.floorMaterial;
                break;



        }


        return mat;
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Clients 👫

    addSelf() {
        let _body = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshNormalMaterial()
        );

        let [videoTexture, videoMaterial] = this.makeVideoTextureAndMaterial("local");

        let _head = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            videoMaterial
        );

        _head.visible = false; // for first person

        // set position of head before adding to parent object
        _body.position.set(0, 0, 0);
        _head.position.set(0, 1, 0);

        // https://threejs.org/docs/index.html#api/en/objects/Group
        this.playerGroup = new THREE.Group();
        this.playerGroup.position.set(0, 0.5, 0);
        this.playerGroup.add(_body);
        this.playerGroup.add(_head);
        this.playerVideoTexture = videoTexture;

        // add group to scene
        this.scene.add(this.playerGroup);
    }

    // add a client meshes, a video element and  canvas for three.js video texture
    addClient(_id) {
        let materials = [];
        for (var i = 0; i < 6; i++) {
            let col = new THREE.Color(0xffffff);
            //let hex = Math.random();
            col.setHSL(1 / 6 * i, 0.5, 0.75);
            //col.offsetHSL(0, 0, -0.4);
            materials.push(new THREE.MeshBasicMaterial({ color: col }));
        }

        let _body = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 1, 0.5),
            //new THREE.MeshNormalMaterial()
            materials
        );

        let [videoTexture, videoMaterial] = this.makeVideoTextureAndMaterial(_id);

        let _head = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            videoMaterial
        );

        // set position of head before adding to parent object
        _body.position.set(0, 0, 0);
        _head.position.set(0, 1, 0);

        // https://threejs.org/docs/index.html#api/en/objects/Group
        var group = new THREE.Group();
        group.add(_body);
        group.add(_head);

        // add group to scene
        this.scene.add(group);

        console.log("Adding client to scene: " + _id);

        this.clients[_id].group = group;
        this.clients[_id].texture = videoTexture;
        this.clients[_id].desiredPosition = new THREE.Vector3();
        // this.clients[_id].desiredRotation = new THREE.Quaternion();
    }

    removeClient(_id) {
        this.scene.remove(this.clients[_id].group);
    }

    // overloaded function can deal with new info or not
    updateClientPositions(_clientProps) {
        let halfClientHeight = 1;

        for (let _id in _clientProps) {
            // we'll update ourselves separately to avoid lag...
            if (_id in this.clients) {
                if (_id != this.mySocketID) {
                    this.clients[_id].desiredPosition = new THREE.Vector3(_clientProps[_id].position[0], _clientProps[_id].position[1], _clientProps[_id].position[2]);
                    // this.clients[_id].desiredRotation = new THREE.Quaternion().fromArray(_clientProps[_id].rotation)
                    let euler = new THREE.Euler(0, _clientProps[_id].rotation[1], 0, 'XYZ');
                    this.clients[_id].group.setRotationFromEuler(euler);
                }
            }
        }
    }

    // TODO make this simpler...? more performant?
    updatePositions() {
        let snapDistance = 0.5;
        // let snapAngle = 0.2; // radians
        for (let _id in this.clients) {
            if (this.clients[_id].group) {
                this.clients[_id].group.position.lerp(this.clients[_id].desiredPosition, 0.2);
                if (this.clients[_id].group.position.distanceTo(this.clients[_id].desiredPosition) < snapDistance) {
                    this.clients[_id].group.position.set(this.clients[_id].desiredPosition.x, this.clients[_id].desiredPosition.y, this.clients[_id].desiredPosition.z);
                }

                // this.clients[_id].group.quaternion.slerp(this.clients[_id].desiredRotation, 0.2);
                // if (this.clients[_id].group.quaternion.angleTo(this.clients[_id].desiredRotation) < snapAngle) {
                //     this.clients[_id].group.quaternion.set(this.clients[_id].desiredRotation.x, this.clients[_id].desiredRotation.y, this.clients[_id].desiredRotation.z, this.clients[_id].desiredRotation.w);
                // }
            }
        }
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Music Streams
    setServerMusicOffset(_offset, _sync_time) {
        console.log('[Music] Server music offset set at: ' + _offset);
        this.serverMusicOffset.offset = _offset;
        this.serverMusicOffset.serverSyncTime = Date.now();
    }

    addMusicStream(_ms) {
        if (!this.musicStreams[_ms.id]) {
            this.musicStreams[_ms.id] = _ms;
        }
        if (!this.musicStreams[_ms.id].positional_audio) {
            let positional_audio = new THREE.PositionalAudio(this.listener);
            positional_audio.setDistanceModel('linear');
            positional_audio.setRefDistance(_ms.refDistance);
            positional_audio.setRolloffFactor(_ms.rollOff);
            positional_audio.setVolume(_ms.gain);
            positional_audio.setLoop(false);
            positional_audio.autoplay = false;
            positional_audio.setMaxDistance(_ms.maxDistance);
            this.musicStreams[_ms.id].audio = positional_audio;
            this.musicStreams[_ms.id].cache = {};
            this.queueNextAudio(_ms.id);

            //let f = this.gui.addFolder(_ms.id);
            //f.add(musicStreams[_ms.id], 'maxDistance').onChange((v) => musicStreams[_ms.id].audio.setMaxDistance(v));
            //f.add(musicStreams[_ms.id], 'rollOff').onChange((v) => musicStreams[_ms.id].audio.setRolloffFactor(v));
            //f.add(musicStreams[_ms.id], 'refDistance').onChange((v) => musicStreams[_ms.id].audio.setRefDistance(v));

            //let paHelper = new THREE.PositionalAudioHelper(positional_audio);
            //positional_audio.add(paHelper);

            let material = new THREE.MeshLambertMaterial();
            material.visible = false;
            let geometry = new THREE.BoxBufferGeometry(1, 1, 1)
            let mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(_ms.x * this.scaleFactor, _ms.y * this.scaleFactor,
                _ms.z * this.scaleFactor);
            mesh.add(positional_audio);
            this.scene.add(mesh);
        }
    }

    findClipForCurrentOffset(_ms_id) {
        let ms = this.musicStreams[_ms_id];
        let offset = (Date.now() - this.serverMusicOffset.serverSyncTime +
            this.serverMusicOffset.offset);
        console.log('[Music] Looking for clip after ' + offset + ' for stream ' +
            _ms_id);
        //CUSTOM
        // for (let i = 0; i < ms.songList.length; i++) {
        //     if (ms.songList[i][1] > offset) {
        //         return {
        //             id: ms.songList[i - 1][0],
        //             time_delta: ms.songList[i - 1][1] - offset,
        //             startTime: ms.songList[i - 1][1]
        //         }
        //     }
        // }
        console.log('[Music] No clip found for stream ' + _ms_id);
    }

    findNextClip(_ms_id, clip_id) {
        console.log('[Music] Looking for clip after ' + clip_id + ' for stream ' +
            _ms_id);
        let ms = this.musicStreams[_ms_id];
        for (let i = 0; i < ms.songList.length - 1; i++) {
            if (ms.songList[i][0] == clip_id) {
                let next_clip_id = ms.songList[i + 1][0];
                console.log('[Music] Next clip id for stream ' + _ms_id + ' is ' + next_clip_id);
                return next_clip_id;
            }
        }
        console.log('[Music] No next clip found, starting again for stream ' + _ms_id);
        return ms.songList[0][0];
    }

    queueNextAudio(_ms_id) {
        let next_clip = this.findClipForCurrentOffset(_ms_id);
        if (next_clip) {
            let audioLoader = new THREE.AudioLoader();
            // Load next clip
            audioLoader.load(next_clip.id, (buffer) => {
                console.log('[Music] [QNA] Buffer for clip ' + next_clip.id + ' loaded.');
                this.musicStreams[_ms_id].cache[next_clip.id] = buffer;
                let currentOffset = (Date.now() - this.serverMusicOffset.serverSyncTime +
                    this.serverMusicOffset.offset);
                currentOffset = currentOffset
                let bufferOffset = currentOffset - next_clip.startTime;
                if (bufferOffset > buffer.duration * 1000) {
                    console.log('[Music] [QNA] Skipping clip ' + next_clip.id +
                        'because offset ' + bufferOffset + ' is greater than ' +
                        'duration ' + buffer.duration * 1000);
                    this.queueNextAudio(_ms_id);
                } else {
                    this.tryPlay(_ms_id, next_clip.id, bufferOffset);
                }
            });
            // Queue next clip to play
            console.log('[Music] Queueing next clip (' + next_clip.id + ') for stream ' +
                _ms_id + ' in ' + next_clip.time_delta + 'ms');
        }
    }

    tryPlay(_ms_id, clip_id, _offset) {
        let offset = _offset;
        if (_offset === undefined) {
            offset = 0;
        }
        if (this.musicStreams[_ms_id].cache[clip_id]) {
            let buffer = this.musicStreams[_ms_id].cache[clip_id];
            if (this.musicStreams[_ms_id].audio.isPlaying) {
                this.musicStreams[_ms_id].audio.pause();
            }
            let audio = this.musicStreams[_ms_id].audio;
            console.log('[Music] [TP] Playing clip ' + clip_id + ' in stream ' + _ms_id);
            let next_clip_id = this.findNextClip(_ms_id, clip_id);
            if (next_clip_id) {
                let callback = this.tryPlay.bind(this, _ms_id, next_clip_id);
                audio.onEnded = function() {
                    console.log('[Music] Finished playing clip ' + clip_id + ' on stream ' +
                        _ms_id + '. Will continue with ' + next_clip_id);
                    audio.isPlaying = false;
                    callback();
                }
                this.musicStreams[_ms_id].cache = {};
                let audioLoader = new THREE.AudioLoader();
                audioLoader.load(next_clip_id, (buffer) => {
                    this.musicStreams[_ms_id].cache[next_clip_id] = buffer;
                });
                console.log('[Music] On ended will try to play ' + next_clip_id + ' for stream ' + _ms_id);
            } else {
                console.log('[Music] Playing last clip ' + clip_id + ' in stream ' + _ms_id);
                audio.onEnded = function() {
                    audio.stop();
                };
            }
            audio.offset = offset / 1000;
            audio.setBuffer(buffer);
            audio.play();

        } else {
            console.log('[Music] Clip ' + clip_id + ' in stream ' + _ms_id + 'not loaded');
            this.queueNextAudio(_ms_id);
        }
    }


    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Collision Detection 🤾‍♀️

    /*
     * setupCollisionDetection()
     *
     * Description:
     * This function sets up collision detection:
     *     - creates this.collidableMeshList which will be populated by this.loadFloorModel function
     *     - creates this.obstacles object which will be queried by player controls before performing movement
     *     - generates arrays of collision detection points, from which we will perform raycasts in this.detectCollisions()
     *
     */
    setupCollisionDetection() {
        this.collidableMeshList = [];

        this.obstacles = {
            forward: false,
            backward: false,
            right: false,
            left: false
        }

        // var numCollisionDetectionPointsPerSide = 3;
        // var numTotalCollisionDetectionPoints = numCollisionDetectionPointsPerSide * 4;

        // get the headMesh vertices
        // var headMeshVertices = this.playerGroup.children[1].geometry.vertices;

        // these are the four vertices of each side:
        // figured out which ones were which with pen and paper...
        // var forwardVertices = [headMeshVertices[1], headMeshVertices[3], headMeshVertices[4], headMeshVertices[6]];
        // var backwardVertices = [headMeshVertices[0], headMeshVertices[2], headMeshVertices[5], headMeshVertices[7]];
        // var rightVertices = [headMeshVertices[0], headMeshVertices[1], headMeshVertices[2], headMeshVertices[3]];
        // var leftVertices = [headMeshVertices[4], headMeshVertices[5], headMeshVertices[6], headMeshVertices[7]]

        // this.forwardCollisionDetectionPoints = this.getPointsBetweenPoints(headMeshVertices[6], headMeshVertices[3], numCollisionDetectionPointsPerSide);
        // this.backwardCollisionDetectionPoints = this.getPointsBetweenPoints(headMeshVertices[2], headMeshVertices[7], numCollisionDetectionPointsPerSide);
        // this.rightCollisionDetectionPoints = this.getPointsBetweenPoints(headMeshVertices[3], headMeshVertices[2], numCollisionDetectionPointsPerSide);
        // this.leftCollisionDetectionPoints = this.getPointsBetweenPoints(headMeshVertices[7], headMeshVertices[6], numCollisionDetectionPointsPerSide);

        // for use debugging collision detection
        if (this.DEBUG_MODE) {
            this.collisionDetectionDebugArrows = [];
            for (let i = 0; i < numTotalCollisionDetectionPoints; i++) {
                var arrow = new THREE.ArrowHelper(new THREE.Vector3(), new THREE.Vector3(), 1, 0x000000)
                this.collisionDetectionDebugArrows.push(arrow)
                this.scene.add(arrow)
            }
        }
    }

    /*
     * getPointsBetweenPoints()
     *
     * Description:
     * Returns an array of numPoints THREE.Vector3 objects evenly spaced between vecA and vecB, including vecA and vecB
     * 
     * based on:
     * https://stackoverflow.com/questions/21249739/how-to-calculate-the-points-between-two-given-points-and-given-distance
     *
     */
    getPointsBetweenPoints(vecA, vecB, numPoints) {
        var points = [];
        var dirVec = vecB.clone().sub(vecA);
        for (let i = 0; i < numPoints; i++) {
            var pt = vecA.clone().add(dirVec.clone().multiplyScalar(i / (numPoints - 1)));
            points.push(pt)
        }
        return points;
    }


    /*
     * detectCollisions()
     *
     * based on method shown here: 
     * https://github.com/stemkoski/stemkoski.github.com/blob/master/Three.js/Collision-Detection.html
     *
     * Description:
     * 1. Creates THREE.Vector3 objects representing the current forward, left, right, backward direction of the character.
     * 2. For each side of the cube, 
     *         - uses the collision detection points created in this.setupCollisionDetection()
     *        - sends a ray out from each point in the direction set up above 
     *         - if any one of the rays hits an object, set this.obstacles.SIDE (i.e. right or left) to true
     * 3. Give this.obstacles object to this.controls
     *
     * To Do: setup helper function to avoid repetitive code
     */
    detectCollisions() {
        // reset obstacles: 
        this.obstacles = {
            forward: false,
            backward: false,
            right: false,
            left: false
        }


        // TODO only use XZ components of forward DIR in case we are looking up or down while travelling forward
        // NOTE: THREE.PlayerControls seems to be backwards (i.e. the 'forward' controls go backwards)... 
        // Weird, but this function respects those directions for the sake of not having to make conversions
        // https://github.com/mrdoob/three.js/issues/1606
        var matrix = new THREE.Matrix4();
        matrix.extractRotation(this.camera.matrix);
        var backwardDir = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix);
        var forwardDir = backwardDir.clone().negate();
        var rightDir = forwardDir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
        var leftDir = rightDir.clone().negate();

        // let forwardDir = new THREE.Vector3();
        // this.controls.getDirection(forwardDir);
        // var backwardDir = forwardDir.clone().negate();
        // var rightDir = forwardDir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
        // var leftDir = rightDir.clone().negate();

        // TODO more points around avatar so we can't be inside of walls
        let pt = this.controls.getObject().position.clone();

        this.forwardCollisionDetectionPoints = [pt];
        this.backwardCollisionDetectionPoints = [pt];
        this.rightCollisionDetectionPoints = [pt];
        this.leftCollisionDetectionPoints = [pt];



        // check forward
        this.obstacles.forward = this.checkCollisions(this.forwardCollisionDetectionPoints, forwardDir, 0);
        this.obstacles.backward = this.checkCollisions(this.backwardCollisionDetectionPoints, backwardDir, 4);
        this.obstacles.left = this.checkCollisions(this.leftCollisionDetectionPoints, leftDir, 8);
        this.obstacles.right = this.checkCollisions(this.rightCollisionDetectionPoints, rightDir, 12);

        // this.controls.obstacles = this.obstacles;
    }

    detectTeleports() {
        var origin = this.getPlayerPositionV()[0];
        //origin.y -= this.cameraHeight;
        var matrix = new THREE.Matrix4();
        matrix.extractRotation(this.camera.matrix);
        var backwardDir = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix);
        var forwardDir = backwardDir.clone().negate();
        forwardDir = forwardDir.multiply(new THREE.Vector3(1, 0, 1)).normalize();

        for (var i = 0; i < this.teleports.length; i++) {
            if (this.checkCollisions([origin], forwardDir, 1, this.teleports[i]['ins'])) {
                let out_mesh = this.teleports[i]['out'];
                let out_box = out_mesh.geometry.boundingBox.clone();
                let lower = out_box.min.add(out_mesh.position).multiplyScalar(this.scaleFactor);
                let upper = out_box.max.add(out_mesh.position).multiplyScalar(this.scaleFactor);
                let randX = this.randomRange(lower.x, upper.x);
                let randY = this.randomRange(lower.y, upper.y);
                let randZ = this.randomRange(lower.z, upper.z);
                this.camera.position.set(randX, randY + this.cameraHeight, randZ);
            }
        }

    }

    checkCollisions(pts, dir, arrowHelperOffset, collidableMeshList) {
        // distance at which a collision will be detected and movement stopped (this should be greater than the movement speed per frame...)
        if (collidableMeshList === undefined) {
            collidableMeshList = this.collidableMeshList;
        }
        var detectCollisionDistance = 1;

        for (var i = 0; i < pts.length; i++) {

            var pt = pts[i].clone();
            // pt.applyMatrix4(this.playerGroup.matrix);
            // pt.y += 1.0; // bias upward to head area of player

            this.raycaster.set(pt, dir);
            var collisions = this.raycaster.intersectObjects(collidableMeshList);

            // arrow helpers for debugging
            if (this.DEBUG_MODE) {
                var a = this.collisionDetectionDebugArrows[i + arrowHelperOffset];
                a.setLength(detectCollisionDistance);
                a.setColor(new THREE.Color("rgb(0, 0, 255)"));
                a.position.x = pt.x;
                a.position.y = pt.y;
                a.position.z = pt.z;
                a.setDirection(dir);
            }

            if (collisions.length > 0 && collisions[0].distance < detectCollisionDistance) {
                return true;
            }
        }
        return false;
    }
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Interactable Hyperlinks for Spring Show 💎

    setupSpringShow() {
        this.linkMaterials = {};
        var loader = new THREE.FontLoader();
        // https://gero3.github.io/facetype.js/
        loader.load('fonts/helvetiker_bold.typeface.json', (response) => {
            // loader.load('fonts/VCR_OSD_Mono_Regular.json', (response) => {
            this.font = response;
            this.createSignage();
            this._updateProjects();
        });
    }

    createSignage() {
        let textDepth = 0.1;
        let curveSegments = 3;
        let message, txt;

        message = "Welcome to the";
        // params: text, size, depth, curveSegments, bevelThickness, bevelSize, bevelEnabled, mirror
        txt = this.create3DText(message, 0.25, textDepth, curveSegments, 0.01, 0.01, false, false);
        txt.position.set(-2, 2.75, 0.5);
        txt.rotateY(Math.PI / 2);
        this.scene.add(txt);


        message = "ITP / IMA Spring Show ";
        // params: text, size, depth, curveSegments, bevelThickness, bevelSize, bevelEnabled, mirror
        txt = this.create3DText(message, 1, textDepth, curveSegments, 0.01, 0.01, false, false);
        txt.position.set(-2, 1.5, 0.0);
        txt.rotateY(Math.PI / 2);
        this.scene.add(txt);


        message = "The E.R.";
        txt = this.create3DText(message, 0.6, textDepth, curveSegments, 0.01, 0.01, false, false);
        txt.position.set(-11.25, 1.75, -18.5);
        txt.rotateY(0);
        this.scene.add(txt);

        message = "Resident's Residence";
        txt = this.create3DText(message, 0.6, textDepth, curveSegments, 0.01, 0.01, false, false);
        txt.position.set(-12.5, 1.75, -0.75);
        txt.rotateY(-Math.PI / 2);
        this.scene.add(txt);

    }

    /*
     * updateProjects(projects) 
     *
     * Description:
     *     - empties out the existing projects array and any existing hyperlink objects within it
     *     - creates XYZ locations for each of the new project hyperlinks
     *     - calls this.createHyperlinkedMesh for each project in the projects array
     *     - places returned objects in this.hyperlinkedObjects array and adds them to the scene
     *
     */
    updateProjects(projects) {
        this.projects = projects;
        this._updateProjects();
    }

    _updateProjects() {
        if (this.font) {
            let projects = this.projects;

            for (let i = 0; i < this.hyperlinkedObjects.length; i++) {
                this.scene.remove(this.hyperlinkedObjects[i]);
            }
            this.hyperlinkedObjects = [];


            // do a check for duplicates
            let dupeCheck = {};
            let numUniqueProjects = 0;

            let uniqueProjects = [];

            for (let projectIndex = 0; projectIndex < projects.length; projectIndex++) {
                let proj = projects[projectIndex];
                let project_id = proj.project_id;

                if (dupeCheck[project_id]) {
                    // console.log('Duplicate with ID: ', proj.project_id);
                } else {
                    dupeCheck[project_id] = true;
                    numUniqueProjects++;
                    uniqueProjects.push(proj);
                }
            }
            console.log("Number of total projects: ", this.projects.length);
            console.log("Number of unique projects: ", numUniqueProjects);

            if (numUniqueProjects > 0) { // if the projects have been updated
                let startIndex = 0;
                let endIndex = 96;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -23.55;
                    let locZ = -80 + (i * 1);
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 16;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -14;
                    let offset = (i - startIndex * 1);
                    let locZ = -6 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 12;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -14;
                    let offset = (i - startIndex * 1);
                    let locZ = -30 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 5;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -14;
                    let offset = (i - startIndex * 1);
                    let locZ = -42.75 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }


                startIndex = endIndex;
                endIndex = endIndex + 10;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -7;
                    let offset = (i - startIndex * 1);
                    let locZ = -57 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 18;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -7;
                    let offset = (i - startIndex * 1);
                    let locZ = -77 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 11;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -23.55;
                    let offset = (i - startIndex * 1);
                    let locZ = -93 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    // hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 11;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -17.25;
                    let offset = (i - startIndex * 1);
                    let locZ = -93 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 11;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -16;
                    let offset = (i - startIndex * 1);
                    let locZ = -93 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    // hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 11;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = -23.55;
                    let offset = (i - startIndex * 1);
                    let locZ = -106 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    // hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = endIndex + 8;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let locX = 1.25;
                    let offset = (i - startIndex * 1);
                    let locZ = -106 + offset;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                // along x axis:

                startIndex = endIndex;
                endIndex = endIndex + 19;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let offset = (i - startIndex * 1);
                    let locX = -21 + offset;
                    let locZ = -106.5;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(-Math.PI / 2);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                startIndex = endIndex;
                endIndex = uniqueProjects.length;
                for (let i = startIndex; i < endIndex; i++) {
                    let proj = uniqueProjects[i];
                    let offset = (i - startIndex * 1);
                    let locX = -21 + offset;
                    let locZ = -95.125;
                    let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
                    hyperlink.rotateY(Math.PI / 2);
                    this.hyperlinkedObjects.push(hyperlink);
                    this.scene.add(hyperlink);
                }

                console.log("We've placed ", endIndex, " projects so far.")
            }

            // startIndex = endIndex;
            // endIndex = 200;
            // for (let i = startIndex; i < endIndex; i++) {
            //     let proj = uniqueProjects[i];
            //     let locX = -23.55;
            //     let offset = (i - startIndex * 1);
            //     let locZ = -80 + offset;
            //     let hyperlink = this.createHyperlinkedMesh(locX, 1.75, locZ, proj);
            //     this.hyperlinkedObjects.push(hyperlink);
            //     this.scene.add(hyperlink);
            // }

        }
    }

    // this decodes the text twice because the project database seems to be double wrapped in html...
    // https://stackoverflow.com/questions/3700326/decode-amp-back-to-in-javascript
    parseText(encodedStr) {
        var dom = this.textParser.parseFromString(
            '<!doctype html><body>' + encodedStr,
            'text/html');
        var decodedString = dom.body.textContent;
        var dom2 = this.textParser.parseFromString(
            '<!doctype html><body>' + decodedString,
            'text/html');
        var decodedString2 = dom2.body.textContent;
        return decodedString2;
    }

    addLineBreak(longString) {
        let spaceIndex = longString.indexOf(" ", 10);
        if (spaceIndex != -1) {
            let firstHalf = longString.slice(0, spaceIndex);
            let secondHalf = longString.slice(spaceIndex, longString.length);
            if (secondHalf.length > 15) {
                secondHalf = this.addLineBreak(secondHalf);
            }
            return firstHalf.trim() + "\n" + secondHalf.trim();
        } else {
            return longString;
        }
    }

    /*
     * createHyperlinkedMesh(x,y,z,_project) 
     *
     * Description:
     *     - creates an object3D for each project at position x,y,z 
     *    - adds _project as userData to the object3D
     *    - returns object3D
     */

    createHyperlinkedMesh(x, y, z, _project) {

        let linkDepth = 0.1;
        let fontColor = 0x343434;
        let statusColor = 0xFFFFFF;
        let fontSize = 0.05;

        var geometry = new THREE.BoxGeometry(linkDepth, 0.75, 0.75);
        var textBoxGeometry = new THREE.BoxGeometry(linkDepth, 0.5, 0.75);

        let textBoxMat;

        // check whether we've visited the link before and set material accordingly
        if (localStorage.getItem(_project.project_id) == "visited") {
            textBoxMat = this.linkVisitedMaterial;
        } else {
            textBoxMat = this.linkMaterial;
        }

        let filename = "images/project_thumbnails/" + _project.project_id + ".png";

        let tex = this.textureLoader.load(filename);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 1);
        let imageMat = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: tex
        });

        this.linkMaterials[_project.project_id.toString()] = imageMat;

        var textSign = new THREE.Mesh(textBoxGeometry, textBoxMat);
        var imageSign = new THREE.Mesh(geometry, imageMat);


        // parse text of name and add line breaks if necessary
        var name = this.parseText(_project.project_name)
        if (name.length > 15) {
            name = this.addLineBreak(name);
        }



        // create name text mesh
        var textMesh = this.createSimpleText(name, fontColor, fontSize);

        textMesh.position.x += (linkDepth / 2) + 0.01; // offset forward
        textMesh.rotateY(Math.PI / 2);

        imageSign.position.set(x, y, z);
        textSign.position.set(0, -0.75 / 2 - 0.5 / 2, 0);
        textSign.add(textMesh);
        imageSign.add(textSign);

        // parse zoom room status
        var status_code = _project.zoom_status;
        let status = "";
        // status_code = 1;
        if (status_code == "1") {
            var statusBoxGemoetry = new THREE.BoxGeometry(linkDepth, 0.125, 0.5);
            var statusSign = new THREE.Mesh(statusBoxGemoetry, this.statusBoxMaterial)
            status = "Live now!";
            var statusTextMesh = this.createSimpleText(status, statusColor, fontSize)
            statusTextMesh.position.x += (linkDepth / 2) + 0.01;
            statusTextMesh.position.y -= 0.0625;
            statusTextMesh.rotateY(Math.PI / 2);
            statusSign.add(statusTextMesh);
            statusSign.position.y += 0.25;
            statusSign.position.x += 0.01;

            imageSign.add(statusSign);
        }

        // https://stackoverflow.com/questions/24690731/three-js-3d-models-as-hyperlink/24692057
        let now = Date.now();
        imageSign.userData = {
            project: _project,
            lastVisitedTime: now
        }

        imageSign.name = _project.project_id;
        return imageSign;
    }

    /*
     * generateProjectModal(project) 
     * 
     * Description:
     *     - generates a modal pop up for a given project object 
     *     - project objects look like this: 
     *        {
     *            "project_id": "1234",
     *            "project_name": "Cats",
     *            "elevator_pitch": "Cats are loving companions for now and all time.",
     *            "description": "Cats is about building a sustainable online community for earth humans.",
     *            "zoom_link": "http://example.com"
     *        }
     * 
     */
    zoomStatusDecoder(status) {
        if (status == "0") {
            return "Currently Offline"
        } else if (status == "1") {
            return "Currently Live"
        } else if (status == "2") {
            return "Project Creator Will Be Right Back"
        } else if (status == "3") {
            return "Room Full Try Again Soon"
        } else {
            return ""
        }
    }
    generateProjectModal(project) {
        // parse project descriptions to render without &amp; etc.
        // https://stackoverflow.com/questions/3700326/decode-amp-back-to-in-javascript

        if (!document.getElementsByClassName("project-modal")[0]) {
            localStorage.setItem(project.project_id, "visited");

            let id = project.project_id;
            let name = project.project_name;
            let pitch = project.elevator_pitch;
            let description = project.description;
            let link = project.zoom_link;
            let room_status = this.zoomStatusDecoder(project.zoom_status)


            let modalEl = document.createElement('div');
            modalEl.className = "project-modal";
            modalEl.id = id + "_modal";

            let contentEl = document.createElement('div');
            contentEl.className = "project-modal-content";

            let closeButton = document.createElement('button');
            closeButton.addEventListener('click', () => {
                modalEl.remove();
                this.controls.lock();
                // https://stackoverflow.com/questions/19426559/three-js-access-scene-objects-by-name-or-id
                let now = Date.now();
                let link = this.scene.getObjectByName(id);
                link.userData.lastVisitedTime = now;
            });
            closeButton.innerHTML = "X";

            let projectImageEl = document.createElement('img');
            let filename = "https://itp.nyu.edu" + project.image;
            // let filename = "images/project_thumbnails/" + project.project_id + ".png";
            projectImageEl.src = filename;
            projectImageEl.className = "project-modal-img";


            let titleEl = document.createElement('h1');
            titleEl.innerHTML = this.parseText(name);
            titleEl.className = "project-modal-title"

            // names
            let names = "";
            for (let i = 0; i < project.users.length; i++) {
                names += project.users[i].user_name;
                if (i < project.users.length - 1) {
                    names += " & ";
                }
            }
            let namesEl = document.createElement('p');
            namesEl.innerHTML = names;
            namesEl.className = "project-modal-names";

            let elevatorPitchHeaderEl = document.createElement('p');
            elevatorPitchHeaderEl.innerHTML = "Elevator Pitch";
            let elevatorPitchEl = document.createElement('p');
            elevatorPitchEl.innerHTML = this.parseText(pitch);
            elevatorPitchEl.className = "project-modal-text";

            let descriptionHeaderEl = document.createElement('p');
            descriptionHeaderEl.innerHTML = "Description";
            let descriptionEl = document.createElement('p');
            descriptionEl.innerHTML = this.parseText(description);
            descriptionEl.className = "project-modal-text"

            let talkToCreatorDiv = document.createElement('div');
            talkToCreatorDiv.className = "project-modal-links-header";
            talkToCreatorDiv.innerHTML = "Talk To The Project Creator In The Zoom Room:"

            let linksDiv = document.createElement('div');
            linksDiv.className = "project-modal-link-container";

            let projectLinkEl = document.createElement('a');
            // projectLinkEl.href = link;
            projectLinkEl.href = project.url;
            projectLinkEl.innerHTML = "Project Website";
            projectLinkEl.target = "_blank";
            projectLinkEl.rel = "noopener noreferrer";



            let zoomLinkEl = document.createElement('a');
            // zoomLinkEl.href = link
            zoomLinkEl.href = link;
            zoomLinkEl.innerHTML = "Zoom Room - " + room_status;
            zoomLinkEl.target = "_blank";
            zoomLinkEl.rel = "noopener noreferrer";

            linksDiv.appendChild(projectLinkEl);
            linksDiv.innerHTML += "&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;";
            linksDiv.appendChild(zoomLinkEl);


            contentEl.appendChild(closeButton);
            contentEl.appendChild(projectImageEl);
            contentEl.appendChild(titleEl);
            contentEl.appendChild(namesEl);
            contentEl.appendChild(elevatorPitchHeaderEl);
            contentEl.appendChild(elevatorPitchEl);
            contentEl.appendChild(descriptionHeaderEl);
            contentEl.appendChild(descriptionEl);
            contentEl.appendChild(talkToCreatorDiv);
            contentEl.appendChild(linksDiv);


            modalEl.appendChild(contentEl);
            document.body.appendChild(modalEl);
        }
    }

    /*
     * highlightHyperlinks() 
     * 
     * Description:
     *     - checks distance between player and object3Ds in this.hyperlinkedObjects array, 
     *     - calls this.generateProjectModal for any projects under a threshold distance
     * 
     */
    highlightHyperlinks() {

        let thresholdDist = 5;
        let now = Date.now();

        // store reference to last highlighted project id
        let lastHighlightedProjectId = this.hightlightedProjectId;

        // cast ray out from camera
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        var intersects = this.raycaster.intersectObjects(this.hyperlinkedObjects);

        // if we have intersections, highlight them
        if (intersects.length > 0) {
            if (intersects[0].distance < thresholdDist) {
                let link = intersects[0].object;
                this.hightlightedProjectId = link.userData.project.project_id;
                // do styling
                this.highlightLink(link);

            }
        }

        // if we've changed which project is highlighted
        if (lastHighlightedProjectId != this.hightlightedProjectId) {
            let link = this.scene.getObjectByName(lastHighlightedProjectId);
            if (link != null) {
                // reset styling
                this.resetLinkMaterial(link);
            }
        } else {
            // no change, so lets check for 
            let link = this.scene.getObjectByName(this.hightlightedProjectId);
            if (link != null) {
                if (now - link.userData.lastVisitedTime > 500) {
                    // reset styling
                    this.hightlightedProjectId = -1;
                    this.resetLinkMaterial(link);
                }
            }
        }


    }

    highlightLink(link) {
        let now = Date.now();
        link.userData.lastVisitedTime = now;
        link.userData.highlighted = true;

        link.children[0].material = this.testMaterial;
        link.scale.set(1.1, 1.1, 1.1);
    }

    resetLinkMaterial(link) {
        link.scale.set(1, 1, 1);
        // reset according to whether we have visited it or not yet
        let mat;
        // check whether we've visited the link before and set material accordingly
        if (localStorage.getItem(link.userData.project.project_id) == "visited") {
            mat = this.linkVisitedMaterial;
        } else {
            mat = this.linkMaterial;
        }
        // console.log(link);
        link.children[0].material = mat;
    }

    activateHighlightedProject() {
        if (this.hightlightedProjectId != -1) {
            let link = this.scene.getObjectByName(this.hightlightedProjectId);
            if (link != null) {
                this.controls.unlock();
                this.generateProjectModal(link.userData.project);
                hackToRemovePlayerTemporarily();
            }
        }
    }



    // creates a text mesh and returns it, from: 
    // https://threejs.org/examples/?q=text#webgl_geometry_text_shapes
    createSimpleText(message, fontColor, fontSize) {
        var xMid, yMid, text;

        var mat = new THREE.LineBasicMaterial({
            color: fontColor,
            side: THREE.DoubleSide
        });

        var shapes = this.font.generateShapes(message, fontSize);

        var geometry = new THREE.ShapeBufferGeometry(shapes);

        geometry.computeBoundingBox();

        xMid = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
        yMid = 0.5 * (geometry.boundingBox.max.y - geometry.boundingBox.min.y);

        geometry.translate(xMid, yMid, 0);

        // make shape ( N.B. edge view not visible )
        text = new THREE.Mesh(geometry, mat);
        return text;
    }

    // this function returns 3D text object
    // from https://threejs.org/examples/?q=text#webgl_geometry_text
    create3DText(text, size, height, curveSegments, bevelThickness, bevelSize, bevelEnabled, mirror) {

        let textGeo = new THREE.TextGeometry(text, {

            font: this.font,

            size: size,
            height: height,
            curveSegments: curveSegments,

            bevelThickness: bevelThickness,
            bevelSize: bevelSize,
            bevelEnabled: bevelEnabled

        });

        textGeo.computeBoundingBox();
        textGeo.computeVertexNormals();

        var triangle = new THREE.Triangle();

        let materials = [
            new THREE.MeshPhongMaterial({ color: 0x57068c, flatShading: true }), // front
            new THREE.MeshPhongMaterial({ color: 0xffffff }) // side
        ];

        // "fix" side normals by removing z-component of normals for side faces
        // (this doesn't work well for beveled geometry as then we lose nice curvature around z-axis)

        if (!bevelEnabled) {

            var triangleAreaHeuristics = 0.1 * (height * size);

            for (var i = 0; i < textGeo.faces.length; i++) {

                var face = textGeo.faces[i];

                if (face.materialIndex == 1) {

                    for (var j = 0; j < face.vertexNormals.length; j++) {

                        face.vertexNormals[j].z = 0;
                        face.vertexNormals[j].normalize();

                    }

                    var va = textGeo.vertices[face.a];
                    var vb = textGeo.vertices[face.b];
                    var vc = textGeo.vertices[face.c];

                    var s = triangle.set(va, vb, vc).getArea();

                    if (s > triangleAreaHeuristics) {

                        for (var j = 0; j < face.vertexNormals.length; j++) {

                            face.vertexNormals[j].copy(face.normal);

                        }

                    }

                }

            }

        }

        var centerOffset = -0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x);

        textGeo = new THREE.BufferGeometry().fromGeometry(textGeo);

        // geometry.computeBoundingBox();

        let xMid = -0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x);
        // let yMid = 0.5 * (geometry.boundingBox.max.y - geometry.boundingBox.min.y);

        textGeo.translate(xMid, 0, 0);

        let textMesh = new THREE.Mesh(textGeo, materials);
        // let hover = 5;

        // textMesh.position.x = centerOffset;
        // textMesh.position.y = hover;
        // textMesh.position.z = 0;

        // textMesh.rotation.x = 0;
        // textMesh.rotation.y = Math.PI * 2;

        if (mirror) {

            let textMesh2 = new THREE.Mesh(textGeo, materials);

            textMesh2.position.x = centerOffset;
            textMesh2.position.y = -hover;
            textMesh2.position.z = height;

            textMesh2.rotation.x = Math.PI;
            textMesh2.rotation.y = Math.PI * 2;

            return textMesh2;
        }

        return textMesh;

    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Player Controls:

    // Set up pointer lock controls and corresponding event listeners
    setupControls() {
        let jumpSpeed = 12;
        this.controls = new THREE.PointerLockControls(this.camera, this.renderer.domElement);

        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;

        this.prevTime = performance.now();
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.vertex = new THREE.Vector3();
        this.color = new THREE.Color();

        var overlay = document.getElementById('overlay');

        this.controls.addEventListener('lock', () => {
            this.clearControls();
            this.paused = false;
            overlay.style.visibility = 'hidden';
            document.getElementById("instructions-overlay").style.visibility = "visible";
        });

        this.controls.addEventListener('unlock', () => {

            overlay.style.visibility = 'visible';
            this.clearControls();
            this.paused = true;
            document.getElementById("instructions-overlay").style.visibility = "hidden";
        });

        this.controls.addEventListener('touch_lock', () => {
            this.clearControls();
            this.paused = false;
            overlay.style.visibility = 'hidden';
            document.getElementById("instructions-overlay").style.visibility = "visible";
        });

        document.addEventListener('keydown', (event) => {

            switch (event.keyCode) {

                case 38: // up
                case 87: // w
                    this.moveForward = true;
                    break;

                case 37: // left
                case 65: // a
                    this.moveLeft = true;
                    break;

                case 40: // down
                case 83: // s
                    this.moveBackward = true;
                    break;

                case 39: // right
                case 68: // d
                    this.moveRight = true;
                    break;

                case 32: // space
                    if (this.canJump === true) this.velocity.y = jumpSpeed;
                    this.canJump = false;
                    break;

            }

        }, false);

        document.addEventListener('keyup', (event) => {

            switch (event.keyCode) {

                case 38: // up
                case 87: // w
                    this.moveForward = false;
                    break;

                case 37: // left
                case 65: // a
                    this.moveLeft = false;
                    break;

                case 40: // down
                case 83: // s
                    this.moveBackward = false;
                    break;

                case 39: // right
                case 68: // d
                    this.moveRight = false;
                    break;

            }

        }, false);

        this.velocity.y = 0;
    }

    // clear control state every time we reenter the game
    clearControls() {
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.velocity.y = 0;
    }

    // update for these controls, which are unfortunately not included in the controls directly...
    // see: https://github.com/mrdoob/three.js/issues/5566
    updateControls() {
        let speed = 50;
        if (this.controls.isLocked === true) {
            var origin = this.controls.getObject().position.clone();
            origin.y -= this.cameraHeight; // origin is at floor level

            this.raycaster.set(this.getPlayerPositionV()[0], new THREE.Vector3(0, -this.cameraHeight, 0).normalize());

            var intersectionsDown = this.raycaster.intersectObjects(this.collidableMeshList);
            var onObject = (intersectionsDown.length > 0 && intersectionsDown[0].distance < 0.1);


            var time = performance.now();
            var rawDelta = (time - this.prevTime) / 1000;
            // clamp delta so lower frame rate clients don't end up way far away
            let delta = Math.min(rawDelta, 0.1);

            this.velocity.x -= this.velocity.x * 10.0 * delta;
            this.velocity.z -= this.velocity.z * 10.0 * delta;

            if (this.gravity) {
                this.velocity.y -= 9.8 * 8.0 * delta; // 100.0 = mass
            }

            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.normalize(); // this ensures consistent this.movements in all this.directions


            if (this.moveForward || this.moveBackward) {
                this.velocity.z -= this.direction.z * speed * delta;
            }

            if (this.moveLeft || this.moveRight) {
                this.velocity.x -= this.direction.x * speed * delta;
            }

            if (onObject === true) {
                this.velocity.y = Math.max(0, this.velocity.y);
                this.canJump = true;
            }


            if ((this.velocity.x > 0 && !this.obstacles.left) || (this.velocity.x < 0 && !this.obstacles.right)) {
                this.controls.moveRight(-this.velocity.x * delta);
            }
            if ((this.velocity.z > 0 && !this.obstacles.backward) || (this.velocity.z < 0 && !this.obstacles.forward)) {
                this.controls.moveForward(-this.velocity.z * delta);
            }

            this.controls.getObject().position.y += (this.velocity.y * delta); // new behavior


            if (this.controls.getObject().position.y < this.cameraHeight) {
                this.velocity.y = 0;
                this.controls.getObject().position.y = this.cameraHeight;
                this.canJump = true;
            }

            this.prevTime = time;
        }
    }


    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Position Update for Socket

    getPlayerPosition() {
        // TODO: use quaternion or are euler angles fine here?
        return [
            [this.camera.position.x, this.camera.position.y - (this.cameraHeight - 0.5), this.camera.position.z],
            [this.camera.rotation.x, this.camera.rotation.y, this.camera.rotation.z]
        ];
    }

    getPlayerPositionV() {
        // TODO: use quaternion or are euler angles fine here?
        return [
            new THREE.Vector3(this.camera.position.x, this.camera.position.y - (this.cameraHeight - 0.5), this.camera.position.z),
            new THREE.Vector3(this.camera.rotation.x, this.camera.rotation.y, this.camera.rotation.z)
        ];
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Loop ⭕️

    update() {
        requestAnimationFrame(() => this.update());

        if (!this.paused) {
            this.updateControls();

            // update volumes every X frames
            this.frameCount++;
            if (this.frameCount % 20 == 0) {
                this.updateClientVolumes();
                this.movementCallback();
                this.highlightHyperlinks();
            }
            if (this.frameCount % 50 == 0) {
                this.selectivelyPauseAndResumeConsumers();
            }
            this.detectCollisions();
            this.detectTeleports();
        }

        this.stats.update();
        this.updatePositions(); // other users
        this.render();
    }



    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Rendering 🎥

    render() {
        // Update video canvases for each client
        this.updateVideoTextures();
        this.renderer.render(this.scene, this.camera);
    }

    updateVideoTextures() {
        for (let _id in this.clients) {
            let remoteVideo = document.getElementById(_id + "_video");
            let remoteVideoCanvas = document.getElementById(_id + "_canvas");
            if (remoteVideo != null && remoteVideoCanvas != null) {
                this.redrawVideoCanvas(remoteVideo, remoteVideoCanvas, this.clients[_id].texture);
            }
        }
    }

    // this function redraws on a 2D <canvas> from a <video> and indicates to three.js
    // that the _videoTex should be updated
    redrawVideoCanvas(_videoEl, _canvasEl, _videoTex) {
        let _canvasDrawingContext = _canvasEl.getContext('2d');

        // check that we have enough data on the video element to redraw the canvas
        if (_videoEl.readyState === _videoEl.HAVE_ENOUGH_DATA) {
            // if so, redraw the canvas from the video element
            _canvasDrawingContext.drawImage(_videoEl, 0, 0, _canvasEl.width, _canvasEl.height);
            // and indicate to three.js that the texture needs to be redrawn from the canvas
            _videoTex.needsUpdate = true;
        }
    }

    // Adapted from: https://github.com/zacharystenger/three-js-video-chat
    makeVideoTextureAndMaterial(_id) {
        // create a canvas and add it to the body
        let rvideoImageCanvas = document.createElement('canvas');
        document.body.appendChild(rvideoImageCanvas);

        rvideoImageCanvas.id = _id + "_canvas";
        // rvideoImageCanvas.width = videoWidth;
        // rvideoImageCanvas.height = videoHeight;
        rvideoImageCanvas.style = "visibility: hidden;";

        // get canvas drawing context
        let rvideoImageContext = rvideoImageCanvas.getContext('2d');

        // background color if no video present
        rvideoImageContext.fillStyle = '#000000';
        rvideoImageContext.fillRect(0, 0, rvideoImageCanvas.width, rvideoImageCanvas.height);

        // make texture
        let videoTexture = new THREE.Texture(rvideoImageCanvas);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;

        // make material from texture
        var movieMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, overdraw: true, side: THREE.DoubleSide });

        return [videoTexture, movieMaterial];
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Audio 📣



    updateClientVolumes() {
        for (let _id in this.clients) {
            if (this.clients[_id].audioElement) {
                let distSquared = this.camera.position.distanceToSquared(this.clients[_id].group.position);
                if (distSquared > this.distanceThresholdSquared) {
                    // TODO pause consumer here, rather than setting volume to zero
                    this.clients[_id].audioElement.volume = 0;
                } else {
                    // from lucasio here: https://discourse.threejs.org/t/positionalaudio-setmediastreamsource-with-webrtc-question-not-hearing-any-sound/14301/29
                    let volume = Math.min(1, this.rolloffNumerator / distSquared);
                    this.clients[_id].audioElement.volume = volume;
                }
            }
        }
    }

    getClosestPeers() {
        let peerIDs = [];
        for (let _id in this.clients) {
            let distSquared = this.camera.position.distanceToSquared(this.clients[_id].group.position);
            if (distSquared <= this.distanceThresholdSquared) {
                peerIDs.push(_id);
            }
        }
        return peerIDs;
    }

    selectivelyPauseAndResumeConsumers() {
        for (let _id in this.clients) {
            let distSquared = this.camera.position.distanceToSquared(this.clients[_id].group.position);
            if (distSquared > this.distanceThresholdSquared) {
                pauseAllConsumersForPeer(_id);
            } else {
                resumeAllConsumersForPeer(_id);
            }
        }
    }

    // At the moment, this just adds a .audioElement parameter to a client stored under _id 
    // which will be updated above
    createOrUpdatePositionalAudio(_id) {
        let audioElement = document.getElementById(_id + "_audio");
        if (audioElement == null) {
            console.log("No audio element found for user with ID: " + _id);
            return;
        }
        this.clients[_id].audioElement = audioElement;
        console.log("The following audio element attached to client with ID " + _id + ":");
        console.log(this.clients[_id].audioElement);

        // for the moment, positional audio using webAudio and THREE.PositionalAudio doesn't work...
        // see the issues on github
        // let audioSource;    
        // if (this.clients[_id]) {
        //     if ("positionalAudioSource" in this.clients[_id]) {
        //         audioSource = this.clients[_id].positionalAudioSource;
        //         this.scene.remove(audioSource);
        //     }

        //     audioSource = new THREE.PositionalAudio(this.listener);
        //     audioSource.setRefDistance(10);
        //     audioSource.setRolloffFactor(10);
        //     audioSource.setVolume(1);
        //     this.clients[_id].positionalAudioSource = audioSource;
        //     this.clients[_id].group.add(audioSource);

        //     // audioSource.setMediaStreamSource(_audioStream);
        //     audioSource.setMediaElementSource(audioElement);
        //     console.log(audioSource);
        // }
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Event Handlers 🍽

    onWindowResize(e) {

        this.width = (window.innerWidth);
        // this.width = (window.innerWidth * 0.9);
        // this.height = (window.innerHeight * 0.7);
        this.height = (window.innerHeight);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    onMouseClick(e) { // not used currently
        // this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        // this.mouse.y = - (e.clientY / window.innerHeight) * 2 + 1;
        // console.log("Click");
        this.activateHighlightedProject();
    }

    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    //==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//==//
    // Utilities:

    /**
     * Returns a random number between min (inclusive) and max (exclusive)
     * https://stackoverflow.com/questions/1527803/generating-random-whole-numbers-in-javascript-in-a-specific-range#1527820
     */
    randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    //==//==//==//==//==//==//==//==// fin //==//==//==//==//==//==//==//==//==//
    // Auxiliary
}

class ColorGUIHelper {
    constructor(object, prop) {
        this.object = object;
        this.prop = prop;
    }
    get value() {
        return `#${this.object[this.prop].getHexString()}`;
    }
    set value(hexString) {
        this.object[this.prop].set(hexString);
    }
}

class DegRadHelper {
    constructor(obj, prop) {
        this.obj = obj;
        this.prop = prop;
    }
    get value() {
        return THREE.MathUtils.radToDeg(this.obj[this.prop]);
    }
    set value(v) {
        this.obj[this.prop] = THREE.MathUtils.degToRad(v);
    }
}


function makeXYZGUI(gui, vector3, name, onChangeFn) {
    const folder = gui.addFolder(name);
    folder.add(vector3, 'x').onChange(onChangeFn);
    folder.add(vector3, 'y').onChange(onChangeFn);
    folder.add(vector3, 'z').onChange(onChangeFn);
    folder.open();
    return folder;
}

function makePointLightGUI(scene, gui, _light, name) {
    let helper = new THREE.PointLightHelper(_light);

    function updateLight() {
        helper.color = _light.color;
        helper.update();
    }
    let lightGui = makeXYZGUI(gui, _light.position, name);
    lightGui.add(_light, 'decay').onChange(updateLight);
    lightGui.add(_light, 'power').onChange(updateLight);
    lightGui.add(_light, 'distance').onChange(updateLight);
    lightGui.addColor(new ColorGUIHelper(_light, 'color'), 'value').name('color');
    scene.add(helper);
}

function makeSpotLightGUI(scene, gui, _light, name) {
    let lightGui = makeXYZGUI(gui, _light.position, name);
    let helper = new THREE.SpotLightHelper(_light);

    function updateLight() {
        _light.target.updateMatrixWorld();
        helper.color = _light.color;
        helper.update();
    }
    makeXYZGUI(lightGui, _light.target.position, name + '_target', updateLight);
    lightGui.add(_light, 'decay').onChange(updateLight);
    lightGui.add(_light, 'power').onChange(updateLight);
    lightGui.add(_light, 'distance').onChange(updateLight);
    lightGui.add(_light, 'penumbra').onChange(updateLight);
    lightGui.add(_light, 'angle', 0, Math.PI / 2).onChange(updateLight);
    lightGui.addColor(new ColorGUIHelper(_light, 'color'), 'value').name('color').onChange(updateLight);
    scene.add(helper);
    updateLight();
}

export default Scene;
