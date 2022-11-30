import * as THREE from 'three';
import { VRButton } from '../../lib/three/examples/jsm/webxr/VRButton.js';
import { OrbitControls } from '../../lib/three/examples/jsm/controls/OrbitControls.js';
import * as ThreeMeshUI from '../../lib/three-mesh-ui/build/three-mesh-ui.module.js';
import * as force3d from "https://cdn.skypack.dev/d3-force-3d";
import { GUI } from '../../lib/dat.gui/build/dat.gui.module.js';

// Written by Marius Irgens as an assignment for INF358 at the University of Bergen
// It is messy and not optimized. Continue at your own risk!
// Finished 12. December 2022

// The following APIs is used:
// https://threejs.org/
// npm install command: npm i three
// https://felix-kling.de/jsnetworkx/
// npm install command: npm i jsnetworkx
// https://github.com/vasturiano/d3-force-3d#simulation_nodes
// npm install command: npm i d3-force-3d
// https://github.com/dataarts/dat.gui/blob/master/API.md
// npm install command: npm i dat.gui
// https://github.com/felixmariotto/three-mesh-ui
// npm install command: npm i three-mesh-ui

// (download and put into "lib" folder one step above project root folder)

//SCENE
let scene;
let camera;
let renderer;
let clock = new THREE.Clock();
let delta;
let frame = 0;

//CONTROLS
let controllerMouse;
let controllerVR;
const UNSELECTED = 0;
const SOURCE_SELECTED = 1;
let moveEnabled = false;
let pointerStartPosition = new THREE.Vector3();
let nodeStartPosition = new THREE.Vector3();
let doublePressTimer = 0.0;
const doublePressTimeInterval = 0.25;
let handedness = 0; //0 = left, 1 = right
let pointerVR;
let pointerMouse;
let rayCaster;

//MATERIALS
let nodeContextMaterial;
let nodeOverlapMaterial;
let nodeSelectedSourceMaterial;
let edgeMeshContextMaterial;
let edgeLineContextUSMaterial;
let edgeLineContextSSMaterial;
let colorInfo = {default_node_opacity: 1.0, default_edge_opacity: 0.35, focussed_context_opacity: 0.1 };
let nodeContextOpacity = colorInfo.default_node_opacity;
let edgeContextOpacity = colorInfo.default_edge_opacity;
let depthWrite = true;
let KValues = {distanceK: 25, numCitK: 1};
let focusInfo = {source_inspired_by_authors: true, authors_inspired_by_source: true};
const contextThreshold = 0.25;

//MODEL
const graphCenterPosition = new THREE.Vector3(0.0, 1.8, 1.0);
let nodeMeshes = [];
let edgeMeshes = [];
let overlappedNode;
let selectedSourceNode;
let reachableNodes = [];
let reachableEdges = [];
let trailingNodes = [];
let trailingEdges = [];
let cyclicNodes = [];
let cyclicEdges = [];
const nodeGeometry = new THREE.SphereGeometry(0.01, 8, 8);
let edgeThickness = {source_SourceUnselected: 0.0040, target_SourceUnselected: 0.0010, source_SourceSelected: 0.0060, target_SourceSelected: 0.0020};
let edgeSourceThickness = edgeThickness.source_SourceUnselected;
let edgeTargetThickness = edgeThickness.target_SourceUnselected;
let edgeSourceVector = new THREE.Vector3();
let edgeTargetVector = new THREE.Vector3();
let edge_vFrom = new THREE.Vector3(0.0, 0.0, 1.0); //Points in Z direction, so positions are made in xy-axis then rotated
let edgeVector = new THREE.Vector3();
let edgeSourceUpVector = new THREE.Vector3();
let edgeSourceLeftVector = new THREE.Vector3();
let edgeSourceRightVector = new THREE.Vector3();
let edgeTargetUpVector = new THREE.Vector3();
let edgeTargetLeftVector = new THREE.Vector3();
let edgeTargetRightVector = new THREE.Vector3();
let edgeQuaternion = new THREE.Quaternion();
let edgeIsLine = false;
let showReachable = true;
let showTrailing = true;
let showCyclic = true;
let sphereDistMeshes = [];
let sphereDistMeshInfo = {opacity: 0.0, sphere_count: 3};

//GRAPH - NETWORKX
let G;
let selectedCsvFile = true;

//GRAPH - D3-FORCE-3D
let graphForceSimulation;
let graphForceLinks;
let graphForceCenter;
let graphForceCollision;
let nodesInSimulation;
let forceAttributes = {link_distance: 0.7, collision_distance: 0.02, link_strength: 0.5, center_strength: 0.5};
let pointToSphere = new THREE.Vector3();
let origoToPoint = new THREE.Vector3();
let origoToSphere = new THREE.Vector3();
let parentVector = new THREE.Vector3();
let interpVector = new THREE.Vector3();
let tempVector = new THREE.Vector3();
let graphForceManyBody;

//DROPDOWN MENU
let dropdownInfo = {source_author: 'someName'};
let dropdownNames = [];

//VR
let oneTimeVrUpdateExecuted = false; //Only run once when switching to VR
let xrCamera;
let headLight;
let VRInfo = {right_handed: false, movement_sticks: false, graph_center_x_position: graphCenterPosition.x, graph_center_y_position: graphCenterPosition.y, graph_center_z_position: graphCenterPosition.z }

//DESKTOP
let oneTimeDesktopUpdateExecuted = true; //Only run once when switching back to desktop

//NAME LABEL FONT
let overlapContainer;
let focusContainers = [];
let fontInfo = {fontScale: 2.5, fontColor: new THREE.Color( 0xffffff )};

function loadFile(filePath) {
    let result = null;
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", filePath, false);
    xmlhttp.send();
    if (xmlhttp.status==200) {
        result = xmlhttp.responseText;
    }
    return result;
}

function csvToArray(str, delimiter = ",") {
    // slice from start of text to the first \n index
    // use split to create an array from string by delimiter
    const headers = str.slice(0, str.indexOf("\n")).split(delimiter);

    // slice from \n index + 1 to the end of the text
    // use split to create an array of each csv value row
    const rows = str.slice(str.indexOf("\n") + 1).split("\n");

    // Map the rows
    // split values from each row into an array
    // use headers.reduce to create an object
    // object properties derived from headers:values
    // the object passed as an element of the array
    const arr = rows.map(function (row) {
        const values = row.split(delimiter);
        const el = headers.reduce(function (object, header, index) {
            object[header] = values[index];
            return object;
        }, {});
        return el;
    });

    // return the array
    return arr;
}

function checkFocusDepth(){
    //UNSELECTED
    if(selectedSourceNode == null) {
        return UNSELECTED;
    }
    //SOURCE SELECTED
    else {
        return SOURCE_SELECTED;
    }
}

export function start() {
    console.log("Made by Marius Irgens\n12. December 2022");
    selectCitationCsvFile();
    setupGraph();
    setupDropdownMenu();
    setupGraphics();
    setupLights();
    setupMaterials();
    setupModel();
    setupControls();
    setupPointers();
    setupGUI();
    animateVR();
}

function selectCitationCsvFile(){
    selectedCsvFile = confirm('Will you be using minimum 12 citations (OK)\nor minimum 8 citations (CANCEL)?\nPlease note that minimum 8 citations can be slow - use 12 for VR!');
}

function setupGraph() {
    let nodesInEdgelist = [];

    //MAKE ARRAYS

    //Authors
    let authorsCsv = loadFile("xls/authors-unique-ext.csv");
    let authorsArray = csvToArray(authorsCsv);
    let citationsCsv;
    //Citations
    if (selectedCsvFile){
        citationsCsv = loadFile("xls/author-to-author-citations-unique-no-self-cit-12-or-more.csv")
    } else {
        citationsCsv = loadFile("xls/author-to-author-citations-unique-no-self-cit-08-or-more.csv")
    }
    let citationsArray = csvToArray(citationsCsv);

    //Nodes in Edge list - Make list of Nodes that is used in Edge list
    for (let i = 0; i < citationsArray.length; i++) {
        let row = citationsArray[i];
        let fromAuthorID = Number(row.frAuthID);
        let toAuthorID = Number(row.toAuthID);
        if (!nodesInEdgelist.includes(fromAuthorID)){
            nodesInEdgelist.push(fromAuthorID)
        }
        if (!nodesInEdgelist.includes(toAuthorID)){
            nodesInEdgelist.push(toAuthorID)
        }
    }

    //GRAPH

    G = new jsnx.DiGraph();

    //NODES
    for (let i = 0; i < authorsArray.length; i++) {
        let row = authorsArray[i];
        if(nodesInEdgelist.includes(Number(row.ID))){
            G.addNode(Number(row.ID), {name: String(row.Name)});
        }
    }

    //EDGES
    for (let i = 0; i < citationsArray.length; i++) {
        let row = citationsArray[i];
        G.addEdge(Number(row.frAuthID), Number(row.toAuthID), {numCit: Number(row.numCit), yFirst: Number(row.yFirst), yLast: Number(row.yLast)});
    }


    //FORCE SIMULATION (D3-FORCE-3D)
    G.removeNode(0);
    G.removeNode(NaN);

    //NODES
    let forceNodeArray = [];
    for (let node in G.nodes()){
        let degree = jsnx.degree(G, G.nodes()[node], "numCit"); //Amount of direct incoming and outgoing citations - use for sphere size
        forceNodeArray[node] = {
            authorID: G.nodes()[node],
            index: node,
            //position: seeded random between -1 and 1 multiplied by the inverted degree factor of 20
            x: graphCenterPosition.x + ((THREE.MathUtils.seededRandom(node+0)-0.5) * 2) * forceAttributes.link_distance * (20 - (degree/50)),
            y: graphCenterPosition.y + ((THREE.MathUtils.seededRandom(node+1)-0.5) * 2) * forceAttributes.link_distance * (20 - (degree/50)),
            z: graphCenterPosition.z + ((THREE.MathUtils.seededRandom(node+2)-0.5) * 2) * forceAttributes.link_distance * (20 - (degree/50)),
            // x: graphCenterPosition.x,
            // y: graphCenterPosition.y,
            // z: graphCenterPosition.z,
            vx: NaN,
            vy: NaN,
            vz: NaN,
            nodeDegree: degree
        }
    }

    //Build node array
    graphForceSimulation = force3d.forceSimulation(forceNodeArray, 3);

    //EDGES
    let forceLinkArray =[];
    for (let edge in G.edges()){
        let link = G.edges()[edge]; //ex [59, 2195]
        let _source = forceNodeArray.find(e => e.authorID === link[0]).index; //ex index for the node with authorID 59
        let _target = forceNodeArray.find(e => e.authorID === link[1]).index; //ex index for the node with authorID 59
        forceLinkArray[edge] = {
            edgeID: link,
            index: edge,
            source: _source,
            target: _target
        }
    }
    //LINK FORCE
    graphForceLinks = force3d.forceLink(forceLinkArray);
    graphForceLinks.distance(forceAttributes.link_distance);
    graphForceLinks.strength(forceAttributes.link_strength);
    graphForceSimulation.force("link", graphForceLinks);

    //CENTER FORCE
    graphForceCenter = force3d.forceCenter(graphCenterPosition.x,graphCenterPosition.y,graphCenterPosition.z);
    graphForceCenter.strength(forceAttributes.center_strength);
    graphForceSimulation.force("center", graphForceCenter);

    //COLLISION FORCE
    graphForceCollision = force3d.forceCollide(forceAttributes.collision_distance);
    graphForceSimulation.force("collide", graphForceCollision);

    //CENTER BY DEGREE FORCE
    //graphForceSimulation.force("centerByDegree", centerByDegree);

    nodesInSimulation = [...graphForceSimulation.nodes()];
    console.log("This graph has " + jsnx.nodes(G).length + " nodes and "  + jsnx.edges(G).length + " edges");
}

function setupDropdownMenu(){
    for (let node in G.nodes()){
        let id = G.nodes()[node];
        dropdownNames.push(G.node.get(id).name);
    }
    //console.log(dropdownNames);
}

function setupGraphics() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    renderer.setSize(window.innerWidth - 10, window.innerHeight - 10);
    document.body.appendChild(renderer.domElement);
    camera.position.x = graphCenterPosition.x;
    camera.position.y = graphCenterPosition.y;
    camera.position.z = graphCenterPosition.z + 1.5;

    //VR
    document.body.appendChild( VRButton.createButton( renderer ) );
    renderer.xr.enabled = true;
    //renderer.antialias = true;
    console.log("Three.js version: " + THREE.REVISION);
}

function setupLights() {
    headLight = new THREE.PointLight( 0xFFFFFF );
    scene.add( headLight );
    headLight.position.set(-10, 20, -10);
    headLight.castShadow = false;
    //Set up shadow properties for the light
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(ambientLight);
}

function updateHeadlight(){
    headLight.position.set(camera.position.x, camera.position.y, camera.position.z);
}

function updateHeadlightVR(){
    headLight.position.set(xrCamera.position.x, xrCamera.position.y, xrCamera.position.z);
}

function setupMaterials() {
    //NODE MATERIALS
    //Context
    nodeContextMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        transparent: true,
        opacity: nodeContextOpacity,
        side: THREE.DoubleSide,
        depthWrite: depthWrite
    });

    nodeOverlapMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide
    });
    //Selected source and target node
    nodeSelectedSourceMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
    });

    //EDGE MATERIALS
    //MESH
    //Context
    edgeMeshContextMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: edgeContextOpacity,
        depthWrite: depthWrite
    });
    //LINE
    edgeLineContextUSMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff
    });
    edgeLineContextSSMaterial = new THREE.LineDashedMaterial({
        color: 0x404040,
        //dashSize: 0.0025,
        //gapSize: 0.0025,
    });
}

function updateMaterials() {

    //Common settings based on focus depth - OPACITY, BLEND
    //UNSELECTED
    if(checkFocusDepth() === UNSELECTED) {
        nodeContextOpacity = colorInfo.default_node_opacity;
        edgeContextOpacity = colorInfo.default_edge_opacity;
        depthWrite = true;
    }
    //SOURCE SELECTED
    else if(checkFocusDepth() === SOURCE_SELECTED) {
        nodeContextOpacity = colorInfo.focussed_context_opacity;
        edgeContextOpacity = colorInfo.focussed_context_opacity;
        depthWrite = false;
    }

    setupMaterials();

    ////////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////  UNSELECTED  //////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////

    //SET ALL TO CONTEXT
    if (checkFocusDepth() === UNSELECTED){
        for (const node in nodeMeshes) {
            nodeMeshes[node].material = nodeContextMaterial;
            nodeMeshes[node].visible = nodeContextOpacity > 0;
        }
        if(edgeIsLine){
            for (const edge in edgeMeshes) {
                edgeMeshes[edge].material = edgeLineContextUSMaterial;
            }
        }
        else{
            for (const edge in edgeMeshes) {
                edgeMeshes[edge].material = edgeMeshContextMaterial;
                edgeMeshes[edge].visible = edgeContextOpacity > 0;
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////  SOURCE_SELECTED  ////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////

    //The order of coloring matters! We need to do nodes -> edges in serial

    if (checkFocusDepth() === SOURCE_SELECTED){
        //DEFAULT TO CONTEXT MATERIAL

        //NODES
        for (const node in nodeMeshes) {
            nodeMeshes[node].material = nodeContextMaterial;
            nodeMeshes[node].visible = nodeContextOpacity > 0;
        }

        //EDGES
        if(edgeIsLine){
            for (const edge in edgeMeshes) {
                edgeMeshes[edge].material = edgeLineContextSSMaterial;
            }
        }
        else{
            for (const edge in edgeMeshes) {
                edgeMeshes[edge].material = edgeMeshContextMaterial;
                edgeMeshes[edge].visible = edgeContextOpacity > 0;
            }
        }

        //REACHABLE NODES

        if(focusInfo.source_inspired_by_authors) {
            for (const node in reachableNodes) {
                let reachableNode = reachableNodes[node];
                //SOURCE
                if (reachableNode.distance === 0) {
                    reachableNode.mesh.material = nodeSelectedSourceMaterial;
                    reachableNode.mesh.visible = true;
                } else {
                    //CALCULATE INSPIRATION
                    reachableNode.inspiration = calculateInspirationMax(reachableNode);
                    //MAKE MATERIAL BASED ON INSPIRATION VALUE
                    if (reachableNode.inspiration < contextThreshold) {
                        reachableNode.mesh.material = nodeContextMaterial;
                    } else {
                        let materialColor = new THREE.Color(reachableNode.inspiration, 0.25, 0.25);
                        reachableNode.mesh.material.dispose;
                        reachableNode.mesh.material = new THREE.MeshStandardMaterial({
                            color: materialColor,
                            side: THREE.DoubleSide
                        });
                        reachableNode.mesh.visible = true;
                    }
                }
            }
        }

        //REACHABLE EDGES

        if(focusInfo.source_inspired_by_authors){
            for(const edge in reachableEdges){
                let reachableEdge = reachableEdges[edge];
                reachableEdge.mesh.material.dispose;
                reachableEdge.mesh.material = reachableEdge.referenceNode.mesh.material;
                reachableEdge.mesh.visible = true;
            }
        }

        //TRAILING NODES

        if(focusInfo.authors_inspired_by_source) {
            for (const node in trailingNodes) {
                let trailingNode = trailingNodes[node];
                //SOURCE
                if (trailingNode.distance === 0) {
                    trailingNode.mesh.material = nodeSelectedSourceMaterial;
                    trailingNode.mesh.visible = true;
                } else {
                    //CALCULATE INSPIRATION
                    trailingNode.inspiration = calculateInspirationMax(trailingNode);
                    //MAKE MATERIAL BASED ON INSPIRATION VALUE
                    if (trailingNode.inspiration < contextThreshold) {
                        trailingNode.mesh.material = nodeContextMaterial;
                    } else {
                        let materialColor = new THREE.Color(0.25, 0.25, trailingNode.inspiration);
                        trailingNode.mesh.material.dispose;
                        trailingNode.mesh.material = new THREE.MeshStandardMaterial({
                            color: materialColor,
                            side: THREE.DoubleSide
                        });
                        trailingNode.mesh.visible = true;
                    }
                }
            }
        }

        //TRAILING EDGES

        if(focusInfo.authors_inspired_by_source) {
            for (const edge in trailingEdges) {
                let trailingEdge = trailingEdges[edge];
                trailingEdge.mesh.material.dispose;
                trailingEdge.mesh.material = trailingEdge.referenceNode.mesh.material;
                trailingEdge.mesh.visible = true;
            }
        }

        //CYCLIC NODES

        if(focusInfo.source_inspired_by_authors && focusInfo.authors_inspired_by_source) {
            for (const node in cyclicNodes) {
                let cyclicNode = cyclicNodes[node];
                //SOURCE
                if (cyclicNode.distance === 0) {
                    cyclicNode.mesh.material = nodeSelectedSourceMaterial;
                    cyclicNode.mesh.visible = true;
                } else {
                    //CHECK IF NODE CYCLE IS NOT BROKEN
                    //Check backwards on reachable paths - can we reach the source?
                    let tracedBackReachable = recursivePathCheck(cyclicNode.reachableReference, 0);
                    //Check backwards on trailing paths - can we reach the source?
                    let tracedBackTrailing = recursivePathCheck(cyclicNode.trailingReference, 1);

                    if(tracedBackReachable && !tracedBackTrailing){
                        //CALCULATE INSPIRATION
                        cyclicNode.inspiration = calculateInspirationMax(cyclicNode.reachableReference);
                        //SET TO CONTEXT IF BELOW THRESHOLD
                        if (cyclicNode.inspiration < contextThreshold) {
                            //cyclicNode.mesh.material = nodeContextMaterial;
                        //OR ELSE, MAKE REACHABLE MATERIAL
                        }else{
                            let materialColor = new THREE.Color(cyclicNode.inspiration, 0.25, 0.25);
                            cyclicNode.mesh.material.dispose;
                            cyclicNode.mesh.material = new THREE.MeshStandardMaterial({
                                color: materialColor,
                                side: THREE.DoubleSide
                            });
                            cyclicNode.mesh.visible = true;
                        }
                    }

                    else if(!tracedBackReachable && tracedBackTrailing) {
                        //CALCULATE INSPIRATION
                        cyclicNode.inspiration = calculateInspirationMax(cyclicNode.trailingReference);
                        //SET TO CONTEXT IF BELOW THRESHOLD
                        if (cyclicNode.inspiration < contextThreshold) {
                            //cyclicNode.mesh.material = nodeContextMaterial;
                            //OR ELSE, MAKE REACHABLE MATERIAL
                        } else {

                            let materialColor = new THREE.Color(0.25, 0.25, cyclicNode.inspiration);
                            cyclicNode.mesh.material.dispose;
                            cyclicNode.mesh.material = new THREE.MeshStandardMaterial({
                                color: materialColor,
                                side: THREE.DoubleSide
                            });
                            cyclicNode.mesh.visible = true;
                        }
                    }
                    else if (tracedBackReachable && tracedBackTrailing) {
                        cyclicNode.inspiration = calculateInspirationMax(cyclicNode);
                        //SET TO CONTEXT IF BELOW THRESHOLD
                        if (cyclicNode.inspiration < contextThreshold) {
                            //cyclicNode.mesh.material = nodeContextMaterial;
                            //OR ELSE, MAKE REACHABLE MATERIAL
                        } else {
                            let materialColor = new THREE.Color(cyclicNode.inspiration, 0.25, cyclicNode.inspiration);
                            cyclicNode.mesh.material.dispose;
                            cyclicNode.mesh.material = new THREE.MeshStandardMaterial({
                                color: materialColor,
                                side: THREE.DoubleSide
                            });
                            cyclicNode.mesh.visible = true;
                        }
                    }
                }
            }
        }

        //CYCLIC EDGES

        if(focusInfo.source_inspired_by_authors && focusInfo.authors_inspired_by_source) {
            for (const edge in cyclicEdges) {
                let cyclicEdge = cyclicEdges[edge];
                cyclicEdge.mesh.material.dispose;
                cyclicEdge.mesh.material = cyclicEdge.referenceNode.mesh.material;
                cyclicEdge.mesh.visible = true;
            }
        }
    }
    overlappedNode.material = nodeOverlapMaterial;
}

function recursivePathCheck(node, type){

    //It traced all the way back to the source
    if(node.distance === 0){
        return true;
        //Check all paths from parents if they are in focus wrt K-values
    } else {
        for (const parent in node.parentObjects) {
            //CHECK IF THERE IS AN EDGE BETWEEN THIS NODE AND PARENT NODE
            let unBroken = false;
            //CHECK REACHABLE
            if(type === 0){ // Reachable means the edge is incoming from the source to this
                let startNode = node.parentObjects[parent].ID;
                let endNode = node.ID;
                let edge = reachableEdges.find(e => e.nodes[0] === startNode && e.nodes[1] === endNode);
                if(edge.mesh.material !== nodeContextMaterial){
                    unBroken = true;
                }
            }
            //CHECK TRAILING
            else if (type === 1){ // Trailing means the edge is outgoing from this to source
                let startNode = node.ID;
                let endNode = node.parentObjects[parent].ID;
                let edge = trailingEdges.find(e => e.nodes[0] === startNode && e.nodes[1] === endNode);
                if(edge.mesh.material !== nodeContextMaterial){
                    unBroken = true;
                }
            }
            //node.parentObjects[parent].inspiration > contextThreshold &&
            if(unBroken){
                return recursivePathCheck(node.parentObjects[parent], type);
            }
        }
        //base case - cant reach the source
        return false;
    }
}

function calculateInspirationAvg(node){
    //AVG INSPIRATION FROM PARENTS
    let inspiration = 0.0;
    let numberOfParents = 0;
    for (const parent in node.parentObjects) {
        inspiration = inspiration + node.parentObjects[parent].inspiration;
        numberOfParents++;

    }
    inspiration = inspiration / numberOfParents;
    //SUBTRACT DISTANCE
    inspiration -= node.distance / KValues.distanceK;
    //SUBTRACT NUMCIT
    inspiration -= node.distance / (node.numCitTotal * KValues.numCitK);
    return inspiration;
}

function calculateInspirationMax(node){
    //MAX INSPIRATION FROM PARENTS
    let inspiration = 0.0;
    for (const parent in node.parentObjects) {
        if(node.parentObjects[parent].inspiration > inspiration) {
            inspiration = node.parentObjects[parent].inspiration;
        }

    }
    //SUBTRACT DISTANCE
    inspiration -= node.distance / KValues.distanceK;
    //SUBTRACT NUMCIT
    inspiration -= node.distance / (node.numCitTotal * KValues.numCitK);
    return inspiration;
}

function setupModel() {

    nodeMeshes = [];

    //NODES
    for (let node in G.nodes()){
        //MESH
        let nodeMesh = new THREE.Mesh(nodeGeometry, nodeContextMaterial);
        nodeMesh.name = "N_" + G.nodes()[node];
        nodeMesh.authorID = G.nodes()[node];
        nodeMesh.authorName = G.node.get(G.nodes()[node]).name;
        nodeMesh.physicsBody = graphForceSimulation.nodes()[node];
        nodeMesh.physicsBody.mesh = nodeMesh;
        nodeMesh.frustumCulled = false;
        nodeMesh.position.set(nodeMesh.physicsBody.x, nodeMesh.physicsBody.y, nodeMesh.physicsBody.z);
        let degree = nodeMesh.physicsBody.nodeDegree;
        nodeMesh.scale.set(scaleByDegree(degree), scaleByDegree(degree), scaleByDegree(degree));
        //SCENE
        scene.add(nodeMesh);
        nodeMeshes.push(nodeMesh);
    }

    edgeMeshes = [];

    //EDGES

    //LINE
    if(edgeIsLine){
        for (let edge in G.edges()) {
            //GEOMETRY
            const positions = new Float32Array( 2 * 3 );
            let edgeGeometry = new THREE.BufferGeometry();
            edgeGeometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ).setUsage( THREE.DynamicDrawUsage) );
            //MESH
            let edgeMesh = new THREE.Line(edgeGeometry, edgeLineContextUSMaterial);
            edgeMesh.name = "E_" + G.edges()[edge][0] + "+" + G.edges()[edge][1];
            edgeMesh.edgeID = G.edges()[edge];
            edgeMesh.physicsBody = graphForceLinks.links()[edge];
            edgeMesh.frustumCulled = false;
            //SCENE
            scene.add(edgeMesh);
            edgeMeshes.push(edgeMesh);
        }
    }

    //MESH
    else{
        for (let edge in G.edges()) {
            //GEOMETRY
            const positions = new Float32Array( 18 * 3 );
            let edgeGeometry = new THREE.BufferGeometry();
            edgeGeometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ).setUsage( THREE.DynamicDrawUsage) );
            //MESH
            let edgeMesh = new THREE.Mesh(edgeGeometry, edgeMeshContextMaterial);
            edgeMesh.name = "E_" + G.edges()[edge][0] + "+" + G.edges()[edge][1];
            edgeMesh.edgeID = G.edges()[edge];
            edgeMesh.physicsBody = graphForceLinks.links()[edge];
            edgeMesh.frustumCulled = false;
            //SCENE
            scene.add(edgeMesh);
            edgeMeshes.push(edgeMesh);
        }
    }
    overlappedNode = nodeMeshes[0];

    //SPHERE DISTANCE MESHES
    let sphereDistGeometry = new THREE.SphereGeometry(1, 64, 64);
    let sphereDistMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
    })
    for(let i = 0; i <= 6; i++){
        let sphereMesh = new THREE.Mesh(sphereDistGeometry, sphereDistMaterial);
        sphereMesh.position.set(graphCenterPosition.x, graphCenterPosition.y, graphCenterPosition.z);
        sphereMesh.visible = false;
        scene.add(sphereMesh);
        sphereDistMeshes.push(sphereMesh);
    }

}

function scaleByDegree(degree){
    //Degree 10 to 1000 - scale 1.0 to 2.0
    let addedScale = degree/1000; //Modify for extra size discrepancy
    return 1.0 + addedScale;
}

function updateModelEdgeIsLine(){
    for(let sphere in sphereDistMeshes){
        sphereDistMeshes[sphere].scale.set(forceAttributes.link_distance * sphere, forceAttributes.link_distance * sphere, forceAttributes.link_distance * sphere);
    }
    //NODES
    for( let node in nodeMeshes) {
        let nodeMesh = nodeMeshes[node];
        nodeMesh.position.set(nodeMesh.physicsBody.x, nodeMesh.physicsBody.y, nodeMesh.physicsBody.z);
    }

    //EDGES
    for (let edge in edgeMeshes) {
        let edgeMesh = edgeMeshes[edge];
        let positionPointComponent = edgeMesh.geometry.attributes.position.array;

        //VECTORS
        //Source, target, rotation
        edgeSourceVector.set(edgeMesh.physicsBody.source.x, edgeMesh.physicsBody.source.y, edgeMesh.physicsBody.source.z);
        edgeTargetVector.set(edgeMesh.physicsBody.target.x, edgeMesh.physicsBody.target.y, edgeMesh.physicsBody.target.z);

        //P0
        positionPointComponent[0] = edgeSourceVector.x;
        positionPointComponent[1] = edgeSourceVector.y;
        positionPointComponent[2] = edgeSourceVector.z;

        //P1
        positionPointComponent[3] = edgeTargetVector.x;
        positionPointComponent[4] = edgeTargetVector.y;
        positionPointComponent[5] = edgeTargetVector.z;

        //Mark mesh for update
        edgeMesh.geometry.attributes.position.needsUpdate = true;

        edgeMesh.computeLineDistances();

    }
}

function updateModelEdgeIsMesh(){
    for(let sphere in sphereDistMeshes){
        sphereDistMeshes[sphere].scale.set(forceAttributes.link_distance * sphere, forceAttributes.link_distance * sphere, forceAttributes.link_distance * sphere);
    }

    //NODES
    for( let node in nodeMeshes) {
        let nodeMesh = nodeMeshes[node];
        nodeMesh.position.set(nodeMesh.physicsBody.x, nodeMesh.physicsBody.y, nodeMesh.physicsBody.z);
    }

    //EDGES
    for (let edge in edgeMeshes) {
        let edgeMesh = edgeMeshes[edge];
        let positionPointComponent = edgeMesh.geometry.attributes.position.array;

        //VECTORS
        //Source, target, rotation
        edgeSourceVector.set(edgeMesh.physicsBody.source.x, edgeMesh.physicsBody.source.y, edgeMesh.physicsBody.source.z);
        edgeTargetVector.set(edgeMesh.physicsBody.target.x, edgeMesh.physicsBody.target.y, edgeMesh.physicsBody.target.z);
        edgeVector = edgeVector.subVectors(edgeTargetVector, edgeSourceVector);
        edgeQuaternion.setFromUnitVectors(edge_vFrom, edgeVector);

        //Source up
        edgeSourceUpVector.set(0.0, (edgeSourceThickness * 1.73), 0.0);
        edgeSourceUpVector.applyQuaternion(edgeQuaternion);
        edgeSourceUpVector.add(edgeSourceVector);

        //source left
        edgeSourceLeftVector.set(-edgeSourceThickness, 0.0, 0.0);
        edgeSourceLeftVector.applyQuaternion(edgeQuaternion);
        edgeSourceLeftVector.add(edgeSourceVector);

        //Source right
        edgeSourceRightVector.set(edgeSourceThickness, 0.0, 0.0);
        edgeSourceRightVector.applyQuaternion(edgeQuaternion);
        edgeSourceRightVector.add(edgeSourceVector);

        //Target up
        edgeTargetUpVector.set(0.0, (edgeTargetThickness * 1.73), 0.0);
        edgeTargetUpVector.applyQuaternion(edgeQuaternion);
        edgeTargetUpVector.add(edgeTargetVector);

        //Target left
        edgeTargetLeftVector.set(-edgeTargetThickness, 0.0, 0.0);
        edgeTargetLeftVector.applyQuaternion(edgeQuaternion);
        edgeTargetLeftVector.add(edgeTargetVector);

        //Target right
        edgeTargetRightVector.set(edgeTargetThickness, 0.0, 0.0);
        edgeTargetRightVector.applyQuaternion(edgeQuaternion);
        edgeTargetRightVector.add(edgeTargetVector);


        //TRIANGLE 1

        //P0
        positionPointComponent[0] = edgeSourceUpVector.x;
        positionPointComponent[1] = edgeSourceUpVector.y;
        positionPointComponent[2] = edgeSourceUpVector.z;

        //P1
        positionPointComponent[3] = edgeTargetUpVector.x;
        positionPointComponent[4] = edgeTargetUpVector.y;
        positionPointComponent[5] = edgeTargetUpVector.z;

        //P2
        positionPointComponent[6] = edgeSourceLeftVector.x;
        positionPointComponent[7] = edgeSourceLeftVector.y;
        positionPointComponent[8] = edgeSourceLeftVector.z;

        //TRIANGLE 2

        //P3
        positionPointComponent[9] = edgeSourceLeftVector.x;
        positionPointComponent[10] = edgeSourceLeftVector.y;
        positionPointComponent[11] = edgeSourceLeftVector.z;

        //P4
        positionPointComponent[12] = edgeTargetLeftVector.x;
        positionPointComponent[13] = edgeTargetLeftVector.y;
        positionPointComponent[14] = edgeTargetLeftVector.z;

        //P5
        positionPointComponent[15] = edgeTargetUpVector.x;
        positionPointComponent[16] = edgeTargetUpVector.y;
        positionPointComponent[17] = edgeTargetUpVector.z;

        //TRIANGLE 3

        //P6
        positionPointComponent[18] = edgeSourceUpVector.x;
        positionPointComponent[19] = edgeSourceUpVector.y;
        positionPointComponent[20] = edgeSourceUpVector.z;

        //P7
        positionPointComponent[21] = edgeTargetUpVector.x;
        positionPointComponent[22] = edgeTargetUpVector.y;
        positionPointComponent[23] = edgeTargetUpVector.z;

        //P8
        positionPointComponent[24] = edgeSourceRightVector.x;
        positionPointComponent[25] = edgeSourceRightVector.y;
        positionPointComponent[26] = edgeSourceRightVector.z;

        //TRIANGLE 4

        //P9
        positionPointComponent[27] = edgeSourceRightVector.x;
        positionPointComponent[28] = edgeSourceRightVector.y;
        positionPointComponent[29] = edgeSourceRightVector.z;

        //P10
        positionPointComponent[30] = edgeTargetRightVector.x;
        positionPointComponent[31] = edgeTargetRightVector.y;
        positionPointComponent[32] = edgeTargetRightVector.z;

        //P11
        positionPointComponent[33] = edgeTargetUpVector.x;
        positionPointComponent[34] = edgeTargetUpVector.y;
        positionPointComponent[35] = edgeTargetUpVector.z;

        //TRIANGLE 5

        //P12
        positionPointComponent[36] = edgeSourceLeftVector.x;
        positionPointComponent[37] = edgeSourceLeftVector.y;
        positionPointComponent[38] = edgeSourceLeftVector.z;

        //P13
        positionPointComponent[39] = edgeTargetRightVector.x;
        positionPointComponent[40] = edgeTargetRightVector.y;
        positionPointComponent[41] = edgeTargetRightVector.z;

        //P14
        positionPointComponent[42] = edgeTargetLeftVector.x;
        positionPointComponent[43] = edgeTargetLeftVector.y;
        positionPointComponent[44] = edgeTargetLeftVector.z;

        //TRIANGLE 6

        //P15
        positionPointComponent[45] = edgeSourceLeftVector.x;
        positionPointComponent[46] = edgeSourceLeftVector.y;
        positionPointComponent[47] = edgeSourceLeftVector.z;

        //P16
        positionPointComponent[48] = edgeSourceRightVector.x;
        positionPointComponent[49] = edgeSourceRightVector.y;
        positionPointComponent[50] = edgeSourceRightVector.z;

        //P17
        positionPointComponent[51] = edgeTargetRightVector.x;
        positionPointComponent[52] = edgeTargetRightVector.y;
        positionPointComponent[53] = edgeTargetRightVector.z;

        //Mark mesh for update
        edgeMesh.geometry.attributes.position.needsUpdate = true;

        //Recalculate normals
        edgeMesh.geometry.computeVertexNormals();

    }
}

function setupControls() {
    //MOUSE
    controllerMouse = new OrbitControls(camera, renderer.domElement);
    controllerMouse.target.set(graphCenterPosition.x,graphCenterPosition.y,graphCenterPosition.z);
    controllerMouse.update();

    rayCaster = new THREE.Raycaster();
    pointerMouse = new THREE.Vector2();

    window.addEventListener( 'pointermove', mousePointerUpdate );
    //window.addEventListener( 'mousedown',  ); move node with mouse
    window.addEventListener( 'dblclick', selectNode );
    window.addEventListener('auxclick', function(e) {
        if (e.button === 1) {
            //middle button clicked
            deselectNode();
        }
        else if(e.button === 2){
            //right button clicked
        }
    });

    //VR
    controllerVR = renderer.xr.getController(handedness);
    //Log controller data when connected
    // controller.addEventListener('connected', (e) => {
    //     console.log(e.data.gamepad);
    // })

    //MOVE CONTROLS
    controllerVR.addEventListener('selectstart', triggerEnabled);
    controllerVR.addEventListener('selectend', triggerDisabled);

    //SELECT CONTROLS
    //doublepress trigger to select nodes, squeeze to deselect
    controllerVR.addEventListener('squeezestart', deselectNode);

}

function mousePointerUpdate( event ) {
    // calculate pointer position in normalized device coordinates
    // (-1 to +1) for both components

    pointerMouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointerMouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

function triggerEnabled() {
    //set move enabled trigger
    moveEnabled = true;
    //set node and pointer startpoints
    pointerStartPosition.set(pointerVR.position.x, pointerVR.position.y, pointerVR.position.z);
    nodeStartPosition.set(overlappedNode.physicsBody.x, overlappedNode.physicsBody.y, overlappedNode.physicsBody.z);
    //restart simulation
    graphForceSimulation.restart();
    //check or set doublepress timer
    if(doublePressTimer > 0) {
        selectNode();
    }
    else{
        doublePressTimer = doublePressTimeInterval;
    }
}

function triggerDisabled() {
    moveEnabled = false;
    if(!VRInfo.movement_sticks){
        overlappedNode.physicsBody.fx = null;
        overlappedNode.physicsBody.fy = null;
        overlappedNode.physicsBody.fz = null;
    }
}

function moveNodeVR() {
    graphForceSimulation.alpha(1.0);
    overlappedNode.physicsBody.fx = nodeStartPosition.x + (pointerVR.position.x - pointerStartPosition.x);
    overlappedNode.physicsBody.fy = nodeStartPosition.y + (pointerVR.position.y - pointerStartPosition.y);
    overlappedNode.physicsBody.fz = nodeStartPosition.z + (pointerVR.position.z - pointerStartPosition.z);
}

function selectNode() {

    //UNSELECTED -> SOURCE SELECTED
    if (checkFocusDepth() === UNSELECTED && overlappedNode) {
        //Set selected source node
        selectedSourceNode = overlappedNode;

        ////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////  REACHABLE  ///////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////

        //NODES (REACHABLE)

        reachableNodes = [];
        reachableEdges = [];

        if(showReachable) {

            //Make temporary list of reachable nodes
            let reachableNodesIDs = [];
            for (const node in G.nodes()) {
                let targetID = (G.nodes()[node]);
                if (jsnx.hasPath(G, {source: selectedSourceNode.authorID, target: targetID})) {
                    reachableNodesIDs.push(targetID);
                }
            }

            //Make finished list of reachable nodes along with their attributes
            for (const node in reachableNodesIDs) {
                let targetID = reachableNodesIDs[node];
                let mesh = nodeMeshes.find(e => e.authorID === targetID);
                //Find the shortest path distance
                let length = jsnx.shortestPathLength(G, {source: selectedSourceNode.authorID, target: targetID});
                let nodeObject = {
                    ID: targetID,
                    distance: length,
                    inspiration: 0.0,
                    numCitTotal: 0,
                    parentIDList: [],
                    parentObjects: [],
                    incomingEdges: [],
                    mesh: mesh
                };
                reachableNodes.push(nodeObject);
            }

            //find the highest distance
            let highestDistance = Math.max.apply(Math, reachableNodes.map(function (o) {
                return o.distance;
            }))

            //iterate outwards from source recursively
            for (let i = 0; i < highestDistance; i++) {
                let tempSources = reachableNodes.filter(e => e.distance === i); //inner nodes of iteration
                let tempTargets = reachableNodes.filter(e => e.distance === (i + 1)); //outer nodes of iteration

                // check each node against parent node
                for (let sourceNode in tempSources) {
                    for (let targetNode in tempTargets) {
                        if (jsnx.hasPath(G, {source: tempSources[sourceNode].ID, target: tempTargets[targetNode].ID})) {
                            if (jsnx.shortestPathLength(G, {
                                source: tempSources[sourceNode].ID,
                                target: tempTargets[targetNode].ID
                            }) === 1) {
                                //get numCit of edge
                                let edgeStart = G.edge.get(tempSources[sourceNode].ID);
                                let edgeFull = edgeStart.get(tempTargets[targetNode].ID);

                                //PUSH PARENTS AND ADD THEIR CITATIONS

                                //Add parent node to list of parents
                                tempTargets[targetNode].parentObjects.push(tempSources[sourceNode]);
                                tempTargets[targetNode].parentIDList.push(tempSources[sourceNode].ID);
                                //Add parent-child edge citation value to child
                                tempTargets[targetNode].numCitTotal += edgeFull.numCit;
                            }
                        }
                    }
                }
            }
            reachableNodes.sort((a,b) => (a.distance > b.distance) ? 1 : ((b.distance > a.distance) ? -1 : 0));
            reachableNodes[0].inspiration = 1.0;

            //EDGES (REACHABLE)

            //Make edgelist
            for (let node in reachableNodes) {
                let thisChild = reachableNodes[node];
                let parentsIDs = thisChild.parentIDList;
                if (parentsIDs.length > 0) {
                    for (let parentID in parentsIDs) {
                        let thisParentID = parentsIDs[parentID];
                        //get numCit of edge
                        let edgeStart = G.edge.get(thisParentID);
                        let edgeFull = edgeStart.get(thisChild.ID);

                        let edgeObject = {
                            referenceNode: thisChild, //endNode (the node that is pointed at)
                            nodes: [thisParentID, thisChild.ID],
                            name: "E_" + thisParentID + "+" + thisChild.ID,
                            numCit: edgeFull.numCit,
                            mesh: null
                        };

                        let mesh = edgeMeshes.find(e => e.name === edgeObject.name);
                        edgeObject.mesh = mesh;
                        reachableEdges.push(edgeObject);
                    }
                }
            }
            // console.log(reachableNodes);
            // console.log(reachableEdges);

        }
        ////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////  TRAILING  ////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////

        //NODES (TRAILING)

        trailingNodes = [];
        trailingEdges = [];

        if(showTrailing) {

            //Make temporary list of trailing nodes
            let trailingNodesIDs = [];
            for (const node in G.nodes()) {
                let sourceID = (G.nodes()[node]);
                if (jsnx.hasPath(G, {source: sourceID, target: selectedSourceNode.authorID})) {
                    trailingNodesIDs.push(sourceID);
                }
            }

            //Make finnished list of trailing nodes along with their attributes
            for (const node in trailingNodesIDs) {
                let sourceID = trailingNodesIDs[node];
                let mesh = nodeMeshes.find(e => e.authorID === sourceID);
                //Find the shortest path distance
                let length = jsnx.shortestPathLength(G, {source: sourceID, target: selectedSourceNode.authorID});
                let nodeObject = {
                    ID: sourceID,
                    distance: length,
                    inspiration: 0.0,
                    numCitTotal: 0,
                    parentIDList: [],
                    parentObjects: [],
                    incomingEdges: [],
                    mesh: mesh
                };
                trailingNodes.push(nodeObject);
            }

            //find the highest distance
            let highestDistance = Math.max.apply(Math, trailingNodes.map(function (o) {
                return o.distance;
            }))

            //iterate outwards from source recursively
            for (let i = 0; i < highestDistance; i++) {
                let tempSources = trailingNodes.filter(e => e.distance === i + 1); //inner nodes of iteration
                let tempTargets = trailingNodes.filter(e => e.distance === i); //outer nodes of iteration

                // check each node against parent node
                for (let sourceNode in tempSources) {
                    for (let targetNode in tempTargets) {
                        if (jsnx.hasPath(G, {source: tempSources[sourceNode].ID, target: tempTargets[targetNode].ID})) {
                            if (jsnx.shortestPathLength(G, {
                                source: tempSources[sourceNode].ID,
                                target: tempTargets[targetNode].ID
                            }) === 1) {
                                //get numCit of edge
                                let edgeStart = G.edge.get(tempSources[sourceNode].ID);
                                let edgeFull = edgeStart.get(tempTargets[targetNode].ID);

                                //PUSH PARENTS AND ADD THEIR CITATIONS

                                //Add parent node to list of parents
                                tempSources[sourceNode].parentObjects.push(tempTargets[targetNode]);
                                tempSources[sourceNode].parentIDList.push(tempTargets[targetNode].ID);
                                //Add parent-child edge citation value to child
                                tempSources[sourceNode].numCitTotal += edgeFull.numCit;
                            }
                        }
                    }
                }
            }
            trailingNodes.sort((a,b) => (a.distance > b.distance) ? 1 : ((b.distance > a.distance) ? -1 : 0));
            trailingNodes[0].inspiration = 1.0;

            //EDGES (TRAILING)

            //Make edgelist
            for (let node in trailingNodes) {
                let thisChild = trailingNodes[node];
                let parentsIDs = thisChild.parentIDList;
                if (parentsIDs.length > 0) {
                    for (let parentID in parentsIDs) {
                        let thisParentID = parentsIDs[parentID];
                        //get numCit of edge
                        let edgeStart = G.edge.get(thisChild.ID);
                        let edgeFull = edgeStart.get(thisParentID);

                        let edgeObject = {
                            referenceNode: thisChild, //startNode (the node that is pointed from)
                            nodes: [thisChild.ID, thisParentID],
                            name: "E_" + thisChild.ID + "+" + thisParentID,
                            numCit: edgeFull.numCit,
                            mesh: null
                        };

                        let mesh = edgeMeshes.find(e => e.name === edgeObject.name);
                        edgeObject.mesh = mesh;
                        trailingEdges.push(edgeObject);
                    }
                }
            }
        }

        //console.log(trailingNodes);
        //console.log(trailingEdges);

        ////////////////////////////////////////////////////////////////////////////////////////
        /////////////////////////////////////  CYCLIC  /////////////////////////////////////////
        ////////////////////////////////////////////////////////////////////////////////////////

        cyclicNodes = [];
        cyclicEdges = [];

        if(showCyclic) {
            for (const rnode in reachableNodes){
                for (const tnode in trailingNodes){
                    //If node is in both lists, make it a cyclic node with:
                    //Distance = the lowest of the two distances
                    //Parents = both incoming and outgoing nodes
                    //numCitTotal = both incoming and outgoing citations
                    if(trailingNodes[tnode].ID === reachableNodes[rnode].ID){
                        let reachableNode = reachableNodes[rnode];
                        let trailingNode = trailingNodes[tnode];
                        let parentOb = reachableNode.parentObjects;
                        parentOb.concat(trailingNode.parentObjects);
                        let parentIDs = reachableNode.parentIDList;
                        parentIDs.concat(trailingNode.parentIDList);
                        let incomingEd = reachableNode.incomingEdges;
                        incomingEd.concat(trailingNode.incomingEdges);
                        let mesh = reachableNode.mesh; //reachable and trailing should reference the same mesh
                        let nodeObject = {
                            ID: reachableNode.ID,
                            distance: Math.min(reachableNode.distance, trailingNode.distance),
                            inspiration: 0.0,
                            numCitTotal: reachableNode.numCitTotal + trailingNode.numCitTotal,
                            parentIDList: parentIDs,
                            parentObjects: parentOb,
                            incomingEdges: incomingEd,
                            mesh: mesh,
                            reachableReference: reachableNode,
                            trailingReference: trailingNode
                        };
                        cyclicNodes.push(nodeObject);
                    }
                }
            }
            cyclicNodes.sort((a,b) => (a.distance > b.distance) ? 1 : ((b.distance > a.distance) ? -1 : 0));

            for (const redge in reachableEdges){
                for (const tedge in trailingEdges){
                    if(trailingEdges[tedge].nodes[0] === reachableEdges[redge].nodes[1] &&
                        trailingEdges[tedge].nodes[1] === reachableEdges[redge].nodes[0]){
                        cyclicEdges.push(reachableEdges[redge]);
                        cyclicEdges.push(trailingEdges[tedge]);
                    }
                }
            }
        }

        console.log(G.node.get(overlappedNode.authorID).name + " focus has in total:\n"
            + reachableNodes.length + " reachable nodes with " + reachableEdges.length + " reachable edges\n"
            + trailingNodes.length + " trailing nodes with " + trailingEdges.length + " trailing edges\n"
            + cyclicNodes.length + " cyclic nodes with " + cyclicEdges.length + " cyclic edges\n");
        //Set edge thickness
        edgeSourceThickness = edgeThickness.source_SourceSelected;
        edgeTargetThickness = edgeThickness.target_SourceSelected;
        //Update materials
        updateMaterials();
        for (let node in reachableNodes) {
            createNameContainer(reachableNodes[node].mesh);
        }
        for (let node in trailingNodes) {
            createNameContainer(trailingNodes[node].mesh);
        }
        for (let node in cyclicNodes) {
            createNameContainer(cyclicNodes[node].mesh);
        }
    }
}

function deselectNode(){

    //BACK TO DEFAULT
    //Remove selection of source node and reachable nodes
    if (checkFocusDepth() === SOURCE_SELECTED) {
        //Remove source node
        selectedSourceNode = null;
        //Remove nodes and edges
        reachableNodes = [];
        reachableEdges = [];
        trailingNodes = [];
        trailingEdges = [];
        cyclicNodes = [];
        cyclicEdges = [];
        //Set edge thickness
        edgeSourceThickness = edgeThickness.source_SourceUnselected;
        edgeTargetThickness = edgeThickness.target_SourceUnselected;
        //Update model
        updateModelEdgeIsMesh();
        //Update materials
        updateMaterials();
        //Update name containers
        scene.remove(overlapContainer);
        for(let container in focusContainers) {
            scene.remove(focusContainers[container]);
        }
        focusContainers = [];
    }
}

function setupPointers() {
    const PointerGeometry = new THREE.SphereGeometry( 0.01, 16, 16 );
    const pointerMaterial = new THREE.MeshBasicMaterial( { color: 0xffff00 } );
    pointerVR = new THREE.Mesh( PointerGeometry, pointerMaterial );
}

function updatePointer() {
    //Update position
    pointerVR.position.set(controllerVR.position.x, controllerVR.position.y, controllerVR.position.z);
}

function setupGUI() {
    const gui = new GUI()
    //SPHERE DISTANCE MEASURE MESHES
    const sphereDistMeshFolder = gui.addFolder('Sphere Distance Measure');
    sphereDistMeshFolder.add(sphereDistMeshInfo, 'opacity', 0.0, 0.2).onChange(updateSphereDistanceMeshOpacity);
    sphereDistMeshFolder.add(sphereDistMeshInfo, 'sphere_count', 1, 6).onChange(updateSphereDistanceMeshOpacity);
    //LAYOUT ALGORITHMS
    const layoutGUIFolder = gui.addFolder('Force layout algorithms');
    const recenterLayoutButton = {reset_layout:function(){ resetLayout() }};
    layoutGUIFolder.add(recenterLayoutButton, 'reset_layout');
    const axisAlignedLayoutButton = {axis_aligned_layout:function(){ axisAlignedLayout() }};
    layoutGUIFolder.add(axisAlignedLayoutButton, 'axis_aligned_layout');
    const sphereDistanceLayoutButton = {radial_layout:function(){ sphereDistanceLayout() }};
    layoutGUIFolder.add(sphereDistanceLayoutButton, 'radial_layout');
    const straightenLayoutButton = {straighten_layout:function(){ straightenLayout() }};
    layoutGUIFolder.add(straightenLayoutButton, 'straighten_layout');
    const reheatButton = {reheat_system:function(){ reheatSimulation() }};
    layoutGUIFolder.add(reheatButton, 'reheat_system');
    //FORCE ATTRIBUTES
    const forceGUIFolder = gui.addFolder('Layout force attributes');
    forceGUIFolder.add(forceAttributes, 'link_distance', 0.1, 2.0).onChange(changeForceAttributes);
    forceGUIFolder.add(forceAttributes, 'collision_distance', 0.01, 0.1).onChange(changeForceAttributes);
    //forceGUIFolder.add(forceAttributes, 'link_strength', 0.0, 1.0).onChange(changeForceAttributes);
    //forceGUIFolder.add(forceAttributes, 'center_strength', 0.0, 1.0).onChange(changeForceAttributes);
    //DEGREE OF INSPIRATION AND FOCUS EXTENT
    const doiGUIFolder = gui.addFolder('Degree-of-inspiration & focus extent');
    doiGUIFolder.add(focusInfo, 'source_inspired_by_authors', true, false).onChange(updateMaterials);
    doiGUIFolder.add(focusInfo, 'authors_inspired_by_source', true, false).onChange(updateMaterials);
    doiGUIFolder.add(KValues, 'distanceK', 0.01, 50).onChange(updateMaterials);
    doiGUIFolder.add(KValues, 'numCitK', 0.01, 4).onChange(updateMaterials);
    //OPACITY
    const colorsGUIFolder = gui.addFolder('Node & edge Opacity');
    colorsGUIFolder.add(colorInfo, 'focussed_context_opacity', -0.01, 1.0).onChange(updateMaterials);
    colorsGUIFolder.add(colorInfo, 'default_node_opacity', 0.0, 1.0).onChange(updateMaterials);
    colorsGUIFolder.add(colorInfo, 'default_edge_opacity', 0.0, 1.0).onChange(updateMaterials);
    //FONT
    const fontFolder = gui.addFolder('Name labels');
    fontFolder.add(fontInfo, 'fontScale', 0.0, 5.0).onChange(updateNameContainerFonts);
    //VR
    const VRFolder = gui.addFolder('VR setup');
    VRFolder.add(VRInfo, 'right_handed', true, false).onChange(updateHandedness);
    VRFolder.add(VRInfo, 'movement_sticks', true, false);
    VRFolder.add(VRInfo, 'graph_center_x_position', -3.0, 3.0).onChange(updateGraphCenterPosition);
    VRFolder.add(VRInfo, 'graph_center_y_position',  0.0, 5.0).onChange(updateGraphCenterPosition);
    VRFolder.add(VRInfo, 'graph_center_z_position', -3.0, 3.0).onChange(updateGraphCenterPosition);
    //EXPERIMENTAL
    // const experimentalFolder = gui.addFolder('Experimental Folder');
    // const manyBodyForceButton = {many_body_force:function(){ addManyForce() }};
    // experimentalFolder.add(manyBodyForceButton, 'many_body_force');
    //DROPDOWN MENU
    gui.add(dropdownInfo, 'source_author', dropdownNames ).onChange(selectAuthorByDropdown);
    //EDGES
    // const edgeGUIFolder = gui.addFolder('Edges');
    // const edgeIsLineButton = {toggle_edge_line_or_mesh:function(){ edgeLineOrMeshToggle() }};
    // edgeGUIFolder.add(edgeIsLineButton, 'toggle_edge_line_or_mesh');
}

function addManyForce(){
    graphForceManyBody = force3d.forceManyBody();
    graphForceManyBody.strength(-0.001);
    graphForceManyBody.theta(0.9);
    graphForceManyBody.distanceMin(0.1);
    graphForceManyBody.distanceMax(1.0);
    graphForceSimulation.force('manybodyForce', graphForceManyBody);
    reheatSimulation();
}

function selectAuthorByDropdown(){
    deselectNode();
    //get mesh by author name
    overlappedNode = nodeMeshes.find(e => e.authorName === dropdownInfo.source_author);
    selectNode();
}

function updateGraphCenterPosition(){
    graphCenterPosition.x = VRInfo.graph_center_x_position;
    graphForceCenter.x(graphCenterPosition.x);
    graphCenterPosition.y = VRInfo.graph_center_y_position;
    graphForceCenter.y(graphCenterPosition.y);
    graphCenterPosition.z = VRInfo.graph_center_z_position;
    graphForceCenter.z(graphCenterPosition.z);
    //Reset camera
    controllerMouse.update();
    reheatSimulation();
}

function updateHandedness(){
    if(VRInfo.right_handed){
        handedness = 1;
    }else{
        handedness = 0;
    }
    controllerVR = renderer.xr.getController(handedness);

    //MOVE CONTROLS
    controllerVR.addEventListener('selectstart', triggerEnabled);
    controllerVR.addEventListener('selectend', triggerDisabled);

    //SELECT CONTROLS
    //doublepress trigger to select nodes, squeeze to deselect
    controllerVR.addEventListener('squeezestart', deselectNode);
}

function updateSphereDistanceMeshOpacity(){
    for(let sphere in sphereDistMeshes){
        sphereDistMeshes[sphere].visible = false;
    }
    for(let sphere = 0;  sphere <= sphereDistMeshInfo.sphere_count; sphere++){
        if(sphereDistMeshInfo.opacity > 0.01){
            sphereDistMeshes[sphere].visible = true;
            sphereDistMeshes[sphere].material.opacity = sphereDistMeshInfo.opacity;
        }
    }
}

function reheatSimulation(){
    graphForceSimulation.alpha(1.0);
    graphForceSimulation.restart();
}

function changeForceAttributes(){
    //Restart simulation after update
    graphForceLinks.distance(forceAttributes.link_distance);
    graphForceLinks.strength(forceAttributes.link_strength);
    graphForceCollision.radius(forceAttributes.collision_distance);
    graphForceCenter.strength(forceAttributes.center_strength);
    graphForceSimulation.alpha(1.0);
    graphForceSimulation.restart();
}

function resetLayout(){
    //Turn of focus force
    graphForceSimulation.force("focusForce", null);
    graphForceSimulation.force("straightenForce", null);
    graphForceSimulation.force("manybodyForce", null);

    //Start nodes at random location
    let simulationNodes = graphForceSimulation.nodes();
    for (let node in simulationNodes) {
        simulationNodes[node].fx = null;
        simulationNodes[node].fy = null;
        simulationNodes[node].fz = null;
        simulationNodes[node].x = graphCenterPosition.x + ((THREE.MathUtils.seededRandom(node+0)-0.5) * 2) * forceAttributes.link_distance * (20 - (simulationNodes[node].nodeDegree/50));
        simulationNodes[node].y = graphCenterPosition.y + ((THREE.MathUtils.seededRandom(node+1)-0.5) * 2) * forceAttributes.link_distance * (20 - (simulationNodes[node].nodeDegree/50));
        simulationNodes[node].z = graphCenterPosition.z + ((THREE.MathUtils.seededRandom(node+2)-0.5) * 2) * forceAttributes.link_distance * (20 - (simulationNodes[node].nodeDegree/50));
    }
    //Reheat
    graphForceSimulation.alpha(1.0);
    graphForceSimulation.restart();
}

function axisAlignedLayout(){
    if(checkFocusDepth() === SOURCE_SELECTED){
        //Turn on force
        graphForceSimulation.force("focusForce", axisAlignedForce);
        graphForceSimulation.alpha(1.0);
        graphForceSimulation.restart();
    }
}

function axisAlignedForce(alpha){
    alpha *= 0.05; //Re-adjust alpha strength
    let axisStrength = 25; //Scale alpha strength in distributed axis
    let linkLength = forceAttributes.link_distance; //Get length between distributed axis links
    graphForceSimulation.nodes().forEach(node => {

        let trailingNode = trailingNodes.find(e => e.ID === node.authorID);
        let reachableNode = reachableNodes.find(e => e.ID === node.authorID);
        let cyclicNode = cyclicNodes.find(e => e.ID === node.authorID);

        if(checkFocusDepth() === SOURCE_SELECTED && node.mesh.material !== nodeContextMaterial) {
            if (node === selectedSourceNode.physicsBody) {
                node.x =  graphCenterPosition.x;
                node.y =  graphCenterPosition.y;
                node.z =  graphCenterPosition.z;
            }
            else if(cyclicNode && focusInfo.authors_inspired_by_source && focusInfo.source_inspired_by_authors){
                node.vx = node.vx - ((node.x - graphCenterPosition.x) * alpha);
                node.vy = node.vy - ((node.y - cyclicNode.distance*linkLength - graphCenterPosition.y) * alpha*axisStrength);
                node.vz = node.vz - ((node.z - graphCenterPosition.z) * alpha);
            }
            else if(reachableNode && focusInfo.source_inspired_by_authors){
                node.vx = node.vx - ((node.x - reachableNode.distance*linkLength - graphCenterPosition.x) * alpha*axisStrength);
                node.vy = node.vy - ((node.y - graphCenterPosition.y) * alpha);
                node.vz = node.vz - ((node.z - graphCenterPosition.z) * alpha);
            }
            else if(trailingNode && focusInfo.authors_inspired_by_source){
                node.vx = node.vx - ((node.x + trailingNode.distance*linkLength - graphCenterPosition.x) * alpha*axisStrength);
                node.vy = node.vy - ((node.y - graphCenterPosition.y) * alpha);
                node.vz = node.vz - ((node.z - graphCenterPosition.z) * alpha);
            }
        }
    })
}

function sphereDistanceLayout(){
    if(checkFocusDepth() === SOURCE_SELECTED){
        //Turn on force
        graphForceSimulation.force("focusForce", sphereDistanceForce);
        graphForceSimulation.alpha(1.0);
        graphForceSimulation.restart();
    }
}

function sphereDistanceForce(alpha){
    graphForceSimulation.nodes().forEach(node => {
        //If node is the source node
        if(checkFocusDepth() === SOURCE_SELECTED && node === selectedSourceNode.physicsBody ){
            node.x =  graphCenterPosition.x;
            node.y =  graphCenterPosition.y;
            node.z =  graphCenterPosition.z;
        }
        //If node is in focus
        else if (checkFocusDepth() === SOURCE_SELECTED && node.mesh.material !== nodeContextMaterial) {

            let trailingNode = trailingNodes.find(e => e.ID === node.authorID);
            let reachableNode = reachableNodes.find(e => e.ID === node.authorID);
            let cyclicNode = cyclicNodes.find(e => e.ID === node.authorID);
            let thisNode;

            if(cyclicNode){
                thisNode = cyclicNode;
            }
            else{
                thisNode = trailingNode || reachableNode;
            }

            //readjust alpha strength
            alpha *= 1.0;

            //Get link length
            let linkLength = forceAttributes.link_distance;

            //from origo to point
            origoToPoint.set(node.x - graphCenterPosition.x, node.y - graphCenterPosition.y, node.z - graphCenterPosition.z);
            //from origo to sphere
            origoToSphere.set(origoToPoint.x, origoToPoint.y, origoToPoint.z);
            origoToSphere.normalize();
            origoToSphere.multiplyScalar(linkLength * thisNode.distance);
            //from point to sphere
            pointToSphere.set(origoToSphere.x - origoToPoint.x, origoToSphere.y - origoToPoint.y, origoToSphere.z - origoToPoint.z);

            node.vx = node.vx + pointToSphere.x * alpha;
            node.vy = node.vy + pointToSphere.y * alpha;
            node.vz = node.vz + pointToSphere.z * alpha;

        }
    })
}

function straightenLayout(){
    if(checkFocusDepth() === SOURCE_SELECTED){
        //Turn on force
        graphForceSimulation.force("straightenForce", edgeStraightenForce);
        graphForceSimulation.alpha(1.0);
        graphForceSimulation.restart();
    }
}

function edgeStraightenForce(alpha){
    graphForceSimulation.nodes().forEach(node => {

        //If node is the source node
        if(checkFocusDepth() === SOURCE_SELECTED && node === selectedSourceNode.physicsBody ){
            node.x =  graphCenterPosition.x;
            node.y =  graphCenterPosition.y;
            node.z =  graphCenterPosition.z;
        }

        let trailingNode = trailingNodes.find(e => e.ID === node.authorID);
        let reachableNode = reachableNodes.find(e => e.ID === node.authorID);
        let cyclicNode = cyclicNodes.find(e => e.ID === node.authorID);
        let thisNode;

        if(cyclicNode){
            thisNode = cyclicNode;
        }
        else{
            thisNode = trailingNode || reachableNode;
        }

        if (thisNode && checkFocusDepth() === SOURCE_SELECTED && thisNode.mesh.material !== nodeContextMaterial && thisNode.distance >= 2) {

            //Get link length
            let linkLength = forceAttributes.link_distance;

            //Reset parent vector
            parentVector.set(0, 0, 0);
            //Make average vector from parent vectors

            for (let parent in thisNode.parentObjects) {
                tempVector.set(thisNode.parentObjects[parent].mesh.position.x, thisNode.parentObjects[parent].mesh.position.y, thisNode.parentObjects[parent].mesh.position.z);
                tempVector.sub(graphCenterPosition);
                parentVector.add(tempVector);
            }
            //parentVector.set(thisNode.parentObjects[0].mesh.position.x, thisNode.parentObjects[0].mesh.position.y, thisNode.parentObjects[0].mesh.position.z);
            //parentVector.sub(graphCenterPosition);
            parentVector.normalize();

            //vector of this node
            origoToPoint.set(node.x - graphCenterPosition.x, node.y - graphCenterPosition.y, node.z - graphCenterPosition.z);
            origoToPoint.normalize();

            //interpolate between straight vector and this nodes vector
            interpVector.lerpVectors(origoToPoint, parentVector, 0.5);
            interpVector.normalize();
            interpVector.multiplyScalar(linkLength * thisNode.distance);

            //from point to sphere
            origoToPoint.set(node.x - graphCenterPosition.x, node.y - graphCenterPosition.y, node.z - graphCenterPosition.z);
            //from point to new vector
            pointToSphere.set(interpVector.x - origoToPoint.x, interpVector.y - origoToPoint.y, interpVector.z - origoToPoint.z);


            node.vx = node.vx + pointToSphere.x * alpha;
            node.vy = node.vy + pointToSphere.y * alpha;
            node.vz = node.vz + pointToSphere.z * alpha;
        }
    })
}

function edgeLineOrMeshToggle(){
    edgeIsLine = !edgeIsLine;
    for (let i = scene.children.length - 1; i >= 0; i--) {
        if(scene.children[i].type === "Mesh" || scene.children[i].type === "Line")
            scene.remove(scene.children[i]);
    }
    setupMaterials();
    setupModel();
    graphForceSimulation.alpha(1.0);
    graphForceSimulation.restart();
    updateMaterials();
}

function oneTimeVrUpdate() {
    //Add pointers to scene
    scene.add( pointerVR );
    //Get reference to the vr camera
    xrCamera = renderer.xr.getCamera();
    //Set overlapped node to some node
    overlappedNode = nodeMeshes[0];
    //Only run one frame
    oneTimeVrUpdateExecuted = true;
    oneTimeDesktopUpdateExecuted = false;
}

function oneTimeDesktopUpdate(){
    scene.remove(pointerVR);
    //Reset camera
    controllerMouse.update();
    //Only run one frame
    oneTimeVrUpdateExecuted = false;
    oneTimeDesktopUpdateExecuted = true;
}

function createNameContainer(atNode) {

    //Remove all containers in scene
    if (checkFocusDepth() === UNSELECTED) {
        scene.remove(overlapContainer);
    }

    //get graph node by Author ID
    let graphNode = G.node.get(atNode.authorID);
    //console.log(graphNode.name); //Author name

    const container = new ThreeMeshUI.Block({
        width: 0.1,
        height: 0.0001,
        padding: 0.005,
        justifyContent: "center",
        textAlign: "center",
        fontFamily: "./fonts/Helvetica-msdf.json",
        fontTexture: "./fonts/Helvetica.png",
        backgroundOpacity: 0.0,
        backgroundColor: new THREE.Color( 0x000000 )
    });

    container.position.set(atNode.position.x, atNode.position.y, atNode.position.z );
    container.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
    //
    container.add(
        new ThreeMeshUI.Text({
            offset: 0.02,
            content: graphNode.name,
            fontSize: 0.01,
            fontColor: new THREE.Color( 0xffffff )
        })
    );
    container.scale.set(fontInfo.fontScale, fontInfo.fontScale, fontInfo.fontScale);

    //UNSELECTED
    if (checkFocusDepth() === UNSELECTED) {
        overlapContainer = container;
        overlapContainer.mesh = atNode;
        scene.add(overlapContainer);
    }
    //SOURCE SELECTED
    else if (checkFocusDepth() === SOURCE_SELECTED) {
        let focusContainer = container
        focusContainer.mesh = atNode;
        focusContainers.push(focusContainer);
        scene.add(focusContainer);
    }
}

function updateNameContainerTransforms() {

    //UNSELECTED
    if(overlapContainer) {
        overlapContainer.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
        overlapContainer.position.set(overlapContainer.mesh.position.x, overlapContainer.mesh.position.y, overlapContainer.mesh.position.z);
    }
    //SOURCE SELECTED
    if (focusContainers.length > 0) {
        for(let container in focusContainers){
            focusContainers[container].rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
            focusContainers[container].position.set(focusContainers[container].mesh.position.x, focusContainers[container].mesh.position.y, focusContainers[container].mesh.position.z);
            //Remove name if below doi threshold, add back in if over threshold
            if (focusContainers[container].mesh.material === nodeContextMaterial){
                focusContainers[container].scale.set(0, 0, 0);
            }
            else{
                focusContainers[container].scale.set(fontInfo.fontScale, fontInfo.fontScale, fontInfo.fontScale);
            }
        }
    }
}

function updateNameContainerFonts(){
    //UNSELECTED
    if(overlapContainer) {
        overlapContainer.scale.set(fontInfo.fontScale, fontInfo.fontScale, fontInfo.fontScale);// = fontInfo.fontsize;
    }
    //SOURCE SELECTED
    if (focusContainers.length > 0) {
        for(let container in focusContainers){
            focusContainers[container].scale.set(fontInfo.fontScale, fontInfo.fontScale, fontInfo.fontScale);
        }
    }
}

function overlapNodeVR() {
    //If selecting source
    if (checkFocusDepth() === UNSELECTED) {
        for (const node in nodeMeshes) {
            if( nodeMeshes[node].position.distanceTo(pointerVR.position) < overlappedNode.position.distanceTo(pointerVR.position) ) {
                overlappedNode = nodeMeshes[node];
                //createNameContainer(overlappedNode);
                updateMaterials();
            }
        }
    }

    if (checkFocusDepth() === SOURCE_SELECTED && reachableNodes.length > 0) {
        for (const node in reachableNodes) {
            if( reachableNodes[node].mesh.position.distanceTo(pointerVR.position) < overlappedNode.position.distanceTo(pointerVR.position) ) {
                overlappedNode = reachableNodes[node].mesh;
                //createNameContainer(overlappedNode);
                updateMaterials();
            }
        }
    }
    if (checkFocusDepth() === SOURCE_SELECTED && trailingNodes.length > 0) {
        for (const node in trailingNodes) {
            if( trailingNodes[node].mesh.position.distanceTo(pointerVR.position) < overlappedNode.position.distanceTo(pointerVR.position) ) {
                overlappedNode = trailingNodes[node].mesh;
                //createNameContainer(overlappedNode);
                updateMaterials();
            }
        }
    }
}

function overlapNodeMouse() {
    rayCaster.setFromCamera( pointerMouse, camera );
    const intersects = rayCaster.intersectObjects( nodeMeshes );
    if(intersects.length > 0 && intersects[0].object !== overlappedNode && checkFocusDepth() === UNSELECTED){
        overlappedNode = intersects[0].object;
        createNameContainer(overlappedNode);
        updateMaterials();
        // if (cyclicNodes.find(e => e.ID === overlappedNode.authorID)){
        //     console.log(cyclicNodes.find(e => e.ID === overlappedNode.authorID).distance);
        // }
    }
}

function animateVR() {
    renderer.setAnimationLoop( function () {
        //Update delta
        delta = clock.getDelta();

        //START VR SECTION
        if (renderer.xr.isPresenting) {
            //One-time update of scene when entering VR
            if (!oneTimeVrUpdateExecuted) {
                oneTimeVrUpdate();
            }
            //Update pointer
            updatePointer();

            //Detect overlapped node
            if(!moveEnabled){
                overlapNodeVR();
            }

            //Update headlight position
            updateHeadlightVR();

        } // END VR SECTION, START BROWSER SECTION
        else {
            if(!oneTimeDesktopUpdateExecuted){
                oneTimeDesktopUpdate();
            }
            overlapNodeMouse();
            updateHeadlight();
        }

        //COMMON SECTION

        //Update model if layout is changing
        if(graphForceSimulation.alpha() > graphForceSimulation.alphaMin()){
            if(edgeIsLine){
               updateModelEdgeIsLine();
            }
            else{
                updateModelEdgeIsMesh();
            }
        }

        if(moveEnabled){
            moveNodeVR();
        }

        //Name container updates (rotation update every frame)
        updateNameContainerTransforms();
        ThreeMeshUI.update();

        //decrease doublepress timer
        if (doublePressTimer > 0) {
            doublePressTimer -= delta;
        }

        //render frame
        renderer.render(scene, camera);
        frame++;
    });
}
