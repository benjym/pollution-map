// <script src="../node_modules/three/examples/js/libs/ammo.wasm.js"></script>

// import * as THREE from '../node_modules/three/build/three.module.js';
import * as THREE from 'https://unpkg.com/three/build/three.module.js';

// import Stats from '../node_modules/three/examples/jsm/libs/stats.module.js';

// import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { OrbitControls } from 'https://unpkg.com/three/examples/jsm/controls/OrbitControls.js';

// Heightfield parameters
var terrainWidthExtents = 100;
var terrainDepthExtents = 100;
var terrainWidth = 10;//128;
var terrainDepth = 10;//128;
// var terrainHalfWidth = terrainWidth / 2;
// var terrainHalfDepth = terrainDepth / 2;
var terrainMaxHeight = 20;
var terrainMinHeight = -20;

// Graphics variables
var container, stats;
var camera, scene, renderer;
var terrainMesh = null;
var clock = new THREE.Clock();

// Physics variables
var collisionConfiguration;
var dispatcher;
var broadphase;
var solver;
var groundBody;
var physicsWorld;
var dynamicObjects = [];
var btBodies = [];
var transformAux1;
var planeGeometry;
var physicsWorld;
var groundShape;
var colGroupPlane = 1;
var colGroupParticles = 2;

var heightData = new Float32Array( terrainWidth * terrainDepth );
for (var p=0; p<(terrainWidth*terrainDepth); p++ ) { heightData[p] = 0; p++}

var ammoHeightData = null;

var time = 0;
var objectTimePeriod = 0.1;
var timeNextSpawn = time + objectTimePeriod;
var maxNumObjects = 1000;

const urlParams = new URLSearchParams(window.location.search);

// var restitution = 0.7;
// var friction = 0.5;

Ammo().then( function ( AmmoLib ) {

	Ammo = AmmoLib;

	init();
	animate();

} );

function init() {
	initGraphics();

	initPhysics();

    generatePlaneGeometry();
    updateGroundPlane(top_marker._latlng.lat,top_marker._latlng.lng);
}

function generatePlaneGeometry() {

    planeGeometry = new THREE.PlaneBufferGeometry( terrainWidthExtents, terrainDepthExtents, terrainWidth - 1, terrainDepth - 1 );
    planeGeometry.rotateX( - Math.PI / 2 );

    var vertices = planeGeometry.attributes.position.array;

    for ( var i = 0, j = 0, l = vertices.length; i < l; i ++, j += 3 ) {
        // j + 1 because it is the y component that we modify
        vertices[ j + 1 ] = heightData[ i ];

    }
    // console.log(heightData[i])

    planeGeometry.computeVertexNormals();

    window.groundMaterial = new THREE.MeshStandardMaterial( { color: 0xC7C7C7 } );
    terrainMesh = new THREE.Mesh( planeGeometry, window.groundMaterial );
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;

    // if ( terrainMesh == null ) {
        // console.log('no terrain mesh found. adding one.')
    scene.add( terrainMesh );
    // }

}

function updatePlaneGeometry() {
    var vertices = planeGeometry.attributes.position.array;

    for ( var i = 0, j = 0, l = vertices.length; i < l; i ++, j += 3 ) {
        // j + 1 because it is the y component that we modify
        vertices[ j + 1 ] = heightData[ i ];
    }
    planeGeometry.computeVertexNormals();
    planeGeometry.attributes.position.needsUpdate = true;
    // console.log(heightData);
}

function initGraphics() {

	container = document.getElementById( 'three' );

	renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( document.getElementById("three").clientWidth, document.getElementById("three").clientHeight );
	renderer.shadowMap.enabled = true;
	container.appendChild( renderer.domElement );

	// stats = new Stats();
	// stats.domElement.style.position = 'absolute';
	// stats.domElement.style.top = '0px';
	// container.appendChild( stats.domElement );

	camera = new THREE.PerspectiveCamera( 60, document.getElementById("three").clientWidth / document.getElementById("three").clientHeight, 0.2, 2000 );

	scene = new THREE.Scene();
	// scene.background = new THREE.Color( 0xbfd1e5 );
    scene.background = new THREE.Color( 0xFFFFFF );

	camera.position.y = 50; //heightData[ terrainHalfWidth + terrainHalfDepth * terrainWidth ] * ( terrainMaxHeight - terrainMinHeight );

	camera.position.z = 40; //terrainDepthExtents / 2;
	camera.lookAt( 0, 0, 0 );

	var controls = new OrbitControls( camera, renderer.domElement );
	// controls.enableZoom = false;

	var light = new THREE.DirectionalLight( 0xffffff, 1 );
	light.position.set( 100, 100, 50 );
	light.castShadow = true;
    const light2 = new THREE.AmbientLight( 0xFFFFFF, 1 ); // soft white light
    scene.add( light2 );


	scene.add( light );


	window.addEventListener( 'resize', onWindowResize, false );

}

export async function updateGroundPlane(lat,lng) {
    console.log('updating ground plane')
    reset_physics();
    console.log('reset physics')
    if (urlParams.has('fake_data')) {
        generateFakeHeight( terrainWidth, terrainDepth, terrainMinHeight, terrainMaxHeight ).then( r => {
            heightData = r;
            console.log('made up some fake height data')
            updatePlaneGeometry();
            console.log('updated threejs plane')
            updateGroundPlaneAmmo();
            console.log('updated ammojs plane')
        });
    }
    else {
        getHeightFromServer(lat,lng).then( r => {
            console.log('got height from server')
            updatePlaneGeometry();
            console.log('updated threejs plane')
            updateGroundPlaneAmmo();
            console.log('updated ammojs plane')
        });
    }

    getSatelliteImage(lat,lng);
    console.log('updated satellite imagery')
}

export async function getSatelliteImage(lat,lng) {
    var access_token = 'pk.eyJ1IjoiYmVuanltYXJrcyIsImEiOiJjand1M3BhanowOGx1NDlzMWs0bG0zNnpyIn0.OLLoUOjLUhcKoAVX1JKVdw';
    // following calculations from here: https://wiki.openstreetmap.org/wiki/Zoom_levels
    var c = 40075016.686; // equatorial circumference of the earth (m)
    var tile_size = 100; // size of whole tile (m)
    var zoom = Math.log(c*Math.cos(top_marker._latlng.lat*Math.PI/180.)/tile_size)/Math.log(2)
    // console.log(zoom)

    var path =  "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/" + lng + "," + lat + "," + zoom + ",0/600x600?access_token=" + access_token;

    const loader = new THREE.TextureLoader();

    loader.load( path,
    	// onLoad callback
    	function ( texture ) {
            window.groundMaterial.map = texture;
            window.groundMaterial.needsUpdate = true;
    	},

    	// onProgress callback currently not supported
    	undefined,

    	// onError callback
    	function ( err ) {
    		console.error( 'An error happened.' );
    	}
    );
}

function onWindowResize() {

	camera.aspect = document.getElementById("three").clientWidth / document.getElementById("three").clientHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( document.getElementById("three").clientWidth, document.getElementById("three").clientHeight );

}

function initPhysics() {

	// Physics configuration

	collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
	dispatcher = new Ammo.btCollisionDispatcher( collisionConfiguration );
	broadphase = new Ammo.btDbvtBroadphase();
	solver = new Ammo.btSequentialImpulseConstraintSolver();
	physicsWorld = new Ammo.btDiscreteDynamicsWorld( dispatcher, broadphase, solver, collisionConfiguration );
	physicsWorld.setGravity( new Ammo.btVector3( 0, - 9.81, 0 ) );

    addGroundPlaneAmmo() // Create the terrain body
	transformAux1 = new Ammo.btTransform();

}

function addGroundPlaneAmmo() {
    groundShape = createTerrainShape(heightData);
	var groundTransform = new Ammo.btTransform();
	groundTransform.setIdentity();
	// Shifts the terrain, since bullet re-centers it on its bounding box.
	groundTransform.setOrigin( new Ammo.btVector3( 0, (Math.min(...heightData) + Math.max(...heightData))/2., 0 ) );
    // groundTransform.setOrigin( new Ammo.btVector3( 0, 0, 0 ) );
	var groundMass = 0;
	var groundLocalInertia = new Ammo.btVector3( 0, 0, 0 );
	var groundMotionState = new Ammo.btDefaultMotionState( groundTransform );
	groundBody = new Ammo.btRigidBody( new Ammo.btRigidBodyConstructionInfo( groundMass, groundMotionState, groundShape, groundLocalInertia ) );
    groundBody.setRestitution(restitution.value);
    groundBody.setFriction(phi.value);
	physicsWorld.addRigidBody( groundBody, colGroupPlane, colGroupParticles );
}

async function updateGroundPlaneAmmo() {
    groundBody = physicsWorld.removeRigidBody( groundBody );
    addGroundPlaneAmmo();
    // groundShape = createTerrainShape(heightData);
    // groundBody.setCollisionShape(groundShape);
}

async function getHeightFromServer(lat, lon) {
    var dx = 0.01; // FIXME
    var dy = 0.01; // FIXME
    var path = window.proxy_server + window.topo_server + "region=" + String(lat-dx) + "," + String(lon-dy) + ";" + String(lat+dx) + "," + String(lon+dy) + ";" + String(terrainWidth) + "," + String(terrainDepth);
    // var path = "test.json";
    const response = fetch( path, { } )
    .then( r => r.json() )
    .then(data => {
      var p = 0;
      for ( var i=0; i<terrainWidth; i++ ) {
          for ( var j=0; j<terrainDepth; j++ ) {
              heightData[i*terrainWidth + j] = parseFloat(data.results[j*terrainWidth + i].elevation);
          }
      }
      var scaling = 10; // HACK!!!! FIX THIS
      var midvalue = heightData[terrainWidth*terrainDepth/2 + terrainDepth/2];
      heightData = heightData.map(function(element){ return (element - midvalue)/scaling; });

    })
    // .then ( function() { updatePlaneGeometry(); updateGroundPlaneAmmo(); })
    return response
}

async function generateFakeHeight( width, depth, minHeight, maxHeight ) {
	// Generates the height data (a sinus wave)
    var h = new Float32Array( width * depth );

	var hRange = maxHeight - minHeight;
	var p = 0;
	for ( var j = 0; j < depth; j ++ ) {
		for ( var i = 0; i < width; i ++ ) {
			h[ p ] = 4*(Math.random()-0.5) + i/width*hRange + minHeight;
			p ++;
		}
	}
    return h
}

function createTerrainShape(heightData) {
    // console.log(heightData)

	// This parameter is not really used, since we are using PHY_FLOAT height data type and hence it is ignored
	var heightScale = 1;

	// Up axis = 0 for X, 1 for Y, 2 for Z. Normally 1 = Y is used.
	var upAxis = 1;

	// hdt, height data type. "PHY_FLOAT" is used. Possible values are "PHY_FLOAT", "PHY_UCHAR", "PHY_SHORT"
	var hdt = "PHY_FLOAT";

	// Set this to your needs (inverts the triangles)
	var flipQuadEdges = false;

	// Creates height data buffer in Ammo heap
	ammoHeightData = Ammo._malloc( 4 * terrainWidth * terrainDepth );

	// Copy the javascript height data array to the Ammo one.
	var p = 0;
	var p2 = 0;
	for ( var j = 0; j < terrainDepth; j ++ ) {

		for ( var i = 0; i < terrainWidth; i ++ ) {

			// write 32-bit float data to memory
			Ammo.HEAPF32[ ammoHeightData + p2 >> 2 ] = heightData[ p ];

			p ++;

			// 4 bytes/float
			p2 += 4;

		}
	}

    console.log(Math.min(...heightData))
	// Creates the heightfield physics shape
	var heightFieldShape = new Ammo.btHeightfieldTerrainShape(
		terrainWidth,
		terrainDepth,
		ammoHeightData,
		heightScale,
		Math.min(...heightData),
		Math.max(...heightData),
		upAxis,
		hdt,
		flipQuadEdges
	);

	// Set horizontal scale
	var scaleX = terrainWidthExtents / ( terrainWidth - 1 );
	var scaleZ = terrainDepthExtents / ( terrainDepth - 1 );
	heightFieldShape.setLocalScaling( new Ammo.btVector3( scaleX, 1, scaleZ ) );

	heightFieldShape.setMargin( 0.05 );

	return heightFieldShape;

}

function generateObject() {

    var diameter = parseFloat(objectSize.value);
	var threeObject = null;
	var shape = null;

	var margin = 0.05*diameter;

    if ( particle_shape.value === 'sphere') {
		// Sphere
		var radius = (1 + parseFloat(randomness.value)*(Math.random() - 0.5)) * diameter;
		threeObject = new THREE.Mesh( new THREE.SphereBufferGeometry( radius, 20, 20 ), createObjectMaterial() );
		shape = new Ammo.btSphereShape( radius );
		shape.setMargin( margin );
    }
    else if ( particle_shape.value === 'cube' ) {
        var sx = (1 + parseFloat(randomness.value)*(Math.random() - 0.5)) * diameter;
        var sy = (1 + parseFloat(randomness.value)*(Math.random() - 0.5)) * diameter;
        var sz = (1 + parseFloat(randomness.value)*(Math.random() - 0.5)) * diameter;
        // console.log(sx, sy, sz)
        threeObject = new THREE.Mesh( new THREE.BoxBufferGeometry( sx, sy, sz, 1, 1, 1 ), createObjectMaterial() );
        shape = new Ammo.btBoxShape( new Ammo.btVector3( sx * 0.5, sy * 0.5, sz * 0.5 ) );
        shape.setMargin( margin );
    }

	// threeObject.position.set( ( Math.random() - 0.5 ) * terrainWidth * 0.6, terrainMaxHeight + objectSize + 2, ( Math.random() - 0.5 ) * terrainDepth * 0.6 );
    // threeObject.position.set(0,terrainMaxHeight + objectSize);
    threeObject.position.set(0, parseFloat(H.value), 0);

	var mass = diameter * 2700.0;
	var localInertia = new Ammo.btVector3( 0, 0, 0 );
	shape.calculateLocalInertia( mass, localInertia );
	var transform = new Ammo.btTransform();
	transform.setIdentity();
	var pos = threeObject.position;
	transform.setOrigin( new Ammo.btVector3( pos.x, pos.y, pos.z ) );
	var motionState = new Ammo.btDefaultMotionState( transform );
	var rbInfo = new Ammo.btRigidBodyConstructionInfo( mass, motionState, shape, localInertia );
	var body = new Ammo.btRigidBody( rbInfo );
    body.setRestitution(restitution.value);
    body.setFriction(phi.value);

	threeObject.userData.physicsBody = body;

	threeObject.receiveShadow = true;
	threeObject.castShadow = true;

	scene.add( threeObject );
	dynamicObjects.push( threeObject );
    btBodies.push( body );
	physicsWorld.addRigidBody( body, colGroupParticles, colGroupPlane );
}

export function reset_physics() {
    console.log('resetting physics')
    for (var i = dynamicObjects.length-1; i>=0; i--) {
        physicsWorld.removeRigidBody( btBodies[i] );
        scene.remove(dynamicObjects[i]);
    }
}

function createObjectMaterial() {

	var c = Math.floor( Math.random() * ( 1 << 24 ) );
	return new THREE.MeshPhongMaterial( { color: c } );

}

function animate() {
	requestAnimationFrame( animate );
	render();
	// stats.update();
}

function render() {

	var deltaTime = clock.getDelta();

	if ( dynamicObjects.length < maxNumObjects && time > timeNextSpawn ) {

		generateObject();
		timeNextSpawn = time + objectTimePeriod;

	}

	updatePhysics( deltaTime );

	renderer.render( scene, camera );

	time += deltaTime;

}

function updatePhysics( deltaTime ) {

//     timeStep - the amount of time in seconds to step the simulation by. Typically you're going to be passing it the time since you last called it.
    // maxSubSteps - the maximum number of steps that Bullet is allowed to take each time you call it.
    // fixedTimeStep - regulates resolution of the simulation. If your balls penetrates your walls instead of colliding with them try to decrease it.
	physicsWorld.stepSimulation( deltaTime, 10, ) // 1./100./parseFloat(objectSize.value) ); // reducing fixedTimeStep keeps things working nicely

	// Update objects
	for ( var i = 0, il = dynamicObjects.length; i < il; i ++ ) {

		var objThree = dynamicObjects[ i ];
		var objPhys = objThree.userData.physicsBody;
		var ms = objPhys.getMotionState();
		if ( ms ) {

			ms.getWorldTransform( transformAux1 );
			var p = transformAux1.getOrigin();
			var q = transformAux1.getRotation();
			objThree.position.set( p.x(), p.y(), p.z() );
			objThree.quaternion.set( q.x(), q.y(), q.z(), q.w() );

		}

	}

}
