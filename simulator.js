// SECCIÓN 500: Importación de Módulos de Three.js
// Carga de la librería THREE.js y el controlador OrbitControls para la navegación 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// SECCIÓN 501: Configuración Inicial y Referencias al DOM
// Referencias a elementos de la interfaz y variables globales para el estado de la simulación.
const statusText = document.getElementById('status-text');
const runBtn = document.getElementById('runSimulationBtn');
const clearBtn = document.getElementById('clearTrajectoryBtn');
const currentBlockText = document.getElementById('current-block-text');

// Función para actualizar el estado con historial
function updateStatus(text, isActive = true) {
    const line = document.createElement('div');
    line.className = `status-line ${isActive ? 'active' : 'completed'}`;
    line.textContent = text;
    
    // Marcar la línea anterior como completada si existe
    const previousActive = statusText.querySelector('.status-line.active');
    if (previousActive) {
        previousActive.classList.remove('active');
        previousActive.classList.add('completed');
    }
    
    statusText.appendChild(line);
    line.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

let scene, camera, renderer, controls;
let tcpObject;
let trajectoryGroup;
let currentPosition = new THREE.Vector3(0, 0.2, 0);
// ✅ NUEVO: Almacenar también la orientación actual
let currentRotation = new THREE.Euler(0, Math.PI, 0); // Rotación inicial (Ry = 180°)
let isSimulating = false;

// SECCIÓN 502: Definición de Materiales para las Trayectorias
// Se definen colores distintos para cada tipo de movimiento para una fácil identificación visual.
const moveJMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // Azul continuo
const moveLMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Verde continuo
const moveCMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Magenta

// SECCIÓN 503: Geometría y Material para los Puntos de Parada
// Esfera pequeña que se usará para marcar los puntos donde el robot se detiene.
const pointGeometry = new THREE.SphereGeometry(0.015, 16, 8);
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Negro

// SECCIÓN 504: Inicialización de la Escena 3D
// Crea la escena, cámara, renderer, luces, suelo, grid, y los objetos iniciales.
function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 10, 50);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(1.5, 1, 1.5);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('webgl-container').appendChild(renderer.domElement);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5);
    scene.add(hemiLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const gridHelper = new THREE.GridHelper(5, 10, 0x888888, 0xbbbbbb);
    scene.add(gridHelper);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.5, 0.2, 0);
    controls.update();
    
    // ✅ NUEVO: Grupo TCP con AxesHelper + Cono direccional
    tcpObject = new THREE.Group();
    
    // Ejes X, Y, Z
    const axes = new THREE.AxesHelper(0.1);
    tcpObject.add(axes);
    
    // ✅ MODIFICADO: Cono con radio de base reducido a la mitad (0.01 en lugar de 0.02)
    const coneGeometry = new THREE.ConeGeometry(0.01, 0.08, 8); // Radio: 0.02 → 0.01
    const coneMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.z = 0.04; // Offset en Z
    cone.rotation.x = Math.PI / 2; // Apuntar hacia adelante
    tcpObject.add(cone);
    
    tcpObject.position.copy(currentPosition);
    tcpObject.rotation.copy(currentRotation);
    scene.add(tcpObject);
    
    trajectoryGroup = new THREE.Group();
    scene.add(trajectoryGroup);
    statusText.textContent = "Listo para simular trayectoria.";
    animate();
}
// SECCIÓN 505: Bucle de Animación (Render Loop)
// Se ejecuta en cada frame para actualizar los controles y renderizar la escena.
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// SECCIÓN 506: Animación del Movimiento del TCP
// ✅ ACTUALIZADO: Ahora anima posición Y rotación
function animateTCPMove(targetPosition, targetRotation, duration) {
    return new Promise(resolve => {
        const startPosition = tcpObject.position.clone();
        const startRotation = tcpObject.rotation.clone();
        const startTime = performance.now();
        
        function animationLoop(currentTime) {
            const elapsedTime = currentTime - startTime;
            let progress = duration > 0 ? Math.min(elapsedTime / duration, 1) : 1;
            
            // Interpolar posición
            tcpObject.position.lerpVectors(startPosition, targetPosition, progress);
            
            // ✅ NUEVO: Interpolar rotación (Euler)
            tcpObject.rotation.x = THREE.MathUtils.lerp(startRotation.x, targetRotation.x, progress);
            tcpObject.rotation.y = THREE.MathUtils.lerp(startRotation.y, targetRotation.y, progress);
            tcpObject.rotation.z = THREE.MathUtils.lerp(startRotation.z, targetRotation.z, progress);
            
            if (progress < 1) {
                requestAnimationFrame(animationLoop);
            } else {
                tcpObject.position.copy(targetPosition);
                tcpObject.rotation.copy(targetRotation);
                currentPosition.copy(targetPosition);
                currentRotation.copy(targetRotation);
                resolve();
            }
        }
        requestAnimationFrame(animationLoop);
    });
}

// SECCIÓN 507: Dibujo de Líneas de Trayectoria
// Añade un segmento de línea a la escena para visualizar el recorrido del robot.
function drawTrajectoryLine(startPoint, endPoint, material) {
    if (startPoint.distanceToSquared(endPoint) < 0.000001) { return; }
    const points = [startPoint.clone(), endPoint.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    // Ya no necesitamos 'computeLineDistances' porque todos los materiales son LineBasicMaterial
    trajectoryGroup.add(line);
}

// SECCIÓN 508: Marcado de Puntos de Parada en la Trayectoria
// Crea y añade una esfera negra para marcar un punto de detención en la trayectoria.
function markPoint(position) {
    const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
    pointMesh.position.copy(position);
    trajectoryGroup.add(pointMesh);
}

// SECCIÓN 509: Limpieza de la Trayectoria y Reseteo del Simulador
// Elimina todos los objetos de la trayectoria, resetea la posición del TCP y limpia el historial.
function clearTrajectory() {
    while(trajectoryGroup.children.length > 0){
        const object = trajectoryGroup.children[0];
        if (object.geometry && object.geometry !== pointGeometry) {
             object.geometry.dispose();
        }
        trajectoryGroup.remove(object);
    }
    currentPosition.set(0, 0.2, 0);
    // ✅ NUEVO: Resetear rotación también
    currentRotation.set(0, Math.PI, 0); // Ry = 180°
    tcpObject.position.copy(currentPosition);
    tcpObject.rotation.copy(currentRotation);
    statusText.innerHTML = '';
    updateStatus("Trayectoria limpiada.");
    currentBlockText.textContent = "-";
}

// Función auxiliar para mover el TCP a una posición (usado en paletizado)
async function moveToPosition(targetPos, material, numSegments = 10) {
    if (!isSimulating) return;
    
    const startPoint = currentPosition.clone();
    const curve = new THREE.LineCurve3(startPoint, targetPos);
    const points = curve.getPoints(numSegments);
    
    for (let i = 1; i < points.length; i++) {
        if (!isSimulating) break;
        await animateTCPMove(points[i], currentRotation, 80);
        if (i === 1) drawTrajectoryLine(startPoint, currentPosition, material);
    }
    
    if (isSimulating) {
        tcpObject.position.copy(targetPos);
        currentPosition.copy(targetPos);
        markPoint(currentPosition);
    }
}

// SECCIÓN 510: Ejecución Principal de la Simulación del Programa
// Lee el programa desde localStorage y ejecuta cada bloque en secuencia.
async function runProgramSimulation() {
    if (isSimulating) { return; }
    
    // ✅ SIEMPRE leer desde localStorage (puede haber sido actualizado)
    const programJSON = localStorage.getItem('robotProgramForSimulation');
    
    if (!programJSON || programJSON === '[]') {
        updateStatus("⚠️ No hay programa cargado. Añade bloques en la interfaz principal.");
        return;
    }
    
    let program;
    try {
        program = JSON.parse(programJSON);
    } catch (error) {
        updateStatus("❌ Error al leer el programa. Intenta generar el código de nuevo.");
        console.error("Error parsing program:", error);
        return;
    }
    
    if (!program || program.length === 0) {
        updateStatus("⚠️ El programa está vacío. Añade bloques en la interfaz principal.");
        return;
    }
    
    // ✅ Mostrar feedback de que se cargó el programa
    updateStatus(`✅ Programa recargado: ${program.length} bloque(s). Iniciando simulación...`);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    isSimulating = true; runBtn.disabled = true; clearBtn.disabled = true;
    currentBlockText.textContent = "Iniciando...";
    clearTrajectory();
    markPoint(currentPosition); // Marcar el punto inicial
    updateStatus("Ejecutando trayectoria...");
    
    for (const block of program) {
        await executeBlock(block);
        if (!isSimulating) break;
    }
    
    updateStatus(isSimulating ? "✅ Simulación completada." : "⚠️ Simulación cancelada.", false);
    currentBlockText.textContent = isSimulating ? "FIN" : "CANCELADO";
    isSimulating = false; runBtn.disabled = false; clearBtn.disabled = false;
}

// SECCIÓN 511: Ejecución de un Bloque Individual del Programa
// Interpreta y simula un único bloque (movimiento, espera, IO, etc.).
async function executeBlock(block) {
    // Construir información del bloque para mostrar
    let blockInfo = `Tipo: ${block.type}`;
    
    // Añadir información específica según el tipo
    if (block.type === 'move_block' || block.type === 'move_linear_block') {
        blockInfo += ` → (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})`;
    } else if (block.type === 'move_circular_block') {
        blockInfo += ` → Vía(${block.via_x ?? 0},${block.via_y ?? 0},${block.via_z ?? 0}) Fin(${block.end_x ?? 0},${block.end_y ?? 0},${block.end_z ?? 0})`;
    } else if (block.type === 'wait_block') {
        blockInfo += ` (${block.time ?? 1}s)`;
    } else if (block.type === 'set_do') {
        blockInfo += ` (Pin:${block.pin} Estado:${block.state == 1 ? 'ON' : 'OFF'})`;
    }
    // ✅ NUEVO: Mostrar info de poses/puntos
    else if (block.type === 'use_pose' && block.poseName) {
        blockInfo += ` → Pose: ${block.poseName} (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})`;
    } else if (block.type === 'use_point' && block.pointName) {
        blockInfo += ` → Punto: ${block.pointName} (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})`;
    } else if (block.type === 'define_pose' && block.name) {
        blockInfo += ` → Definir: ${block.name}`;
    } else if (block.type === 'define_point' && block.name) {
        blockInfo += ` → Definir: ${block.name}`;
    } else if (block.type === 'palletize_block') {
        const rows = block.rows ?? 3;
        const cols = block.cols ?? 4;
        const layers = block.layers ?? 2;
        blockInfo += ` → Paletizado ${rows}×${cols}×${layers} (${rows*cols*layers} posiciones)`;
    }
    
    currentBlockText.textContent = blockInfo;
    
    const previousPosition = currentPosition.clone(); 

    // Procesar el bloque
    switch (block.type) {
        
    case 'use_pose':
    case 'use_point':
    case 'move_block':
    case 'move_linear_block':
            { 
                if (block.x === undefined || block.y === undefined || block.z === undefined) {
                    updateStatus(`⚠️ Bloque ${block.type} sin coordenadas (pose/punto no definido).`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                }
                
                const isLinearMove = block.type === 'move_linear_block' || 
                                   block.type === 'use_pose' || 
                                   block.type === 'use_point';
                
                updateStatus(`Moviendo TCP a (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})...`);
                
                const startPoint = previousPosition.clone();
                const targetPos = new THREE.Vector3(
                    (block.x ?? 0) / 1000,
                    (block.z ?? 0) / 1000,
                    -(block.y ?? 0) / 1000
                );
                
                // ✅ NUEVO: Calcular rotación objetivo
                const targetRot = new THREE.Euler(
                    (block.rx ?? 0) * Math.PI / 180,      // Rx en radianes
                    ((block.ry ?? 180) - 90) * Math.PI / 180, // Ry ajustado (UR usa 180° como default)
                    (block.rz ?? 0) * Math.PI / 180       // Rz en radianes
                );
                
                const lineMaterial = isLinearMove ? moveLMaterial : moveJMaterial;

                const numSegments = 15;
                const totalDuration = 1000;
                const segmentDuration = totalDuration / numSegments;
                
                let curve;
                if (isLinearMove) {
                    curve = new THREE.LineCurve3(startPoint, targetPos);
                } else {
                    const midPoint = new THREE.Vector3().lerpVectors(startPoint, targetPos, 0.5);
                    midPoint.y += startPoint.distanceTo(targetPos) * 0.25; 
                    curve = new THREE.QuadraticBezierCurve3(startPoint, midPoint, targetPos);
                }
                
                const pointsOnCurve = curve.getPoints(numSegments);
                
                let segmentStartPoint = startPoint;
                
                for (let i = 1; i < pointsOnCurve.length; i++) {
                    if (!isSimulating) break;
                    
                    const segmentEndPoint = pointsOnCurve[i];
                    // ✅ ACTUALIZADO: Pasar también la rotación
                    await animateTCPMove(segmentEndPoint, targetRot, segmentDuration);
                    drawTrajectoryLine(segmentStartPoint, currentPosition, lineMaterial);
                    segmentStartPoint.copy(currentPosition);
                }

                if (isSimulating) {
                    tcpObject.position.copy(targetPos);
                    tcpObject.rotation.copy(targetRot);
                    currentPosition.copy(targetPos);
                    currentRotation.copy(targetRot);
                    markPoint(currentPosition);
                }
            }
            break;
        
       // ✅ NUEVO: Ignorar bloques de definición (no generan movimiento)
       case 'define_pose':
       case 'define_point':
           updateStatus(`📍 Definición: ${block.name || 'sin nombre'}`);
           await new Promise(resolve => setTimeout(resolve, 200)); // Pausa breve
           break;
        
       // SECCIÓN 513: Simulación de Espera (Wait)
       case 'wait_block':
            const time = block.time || 1;
            updateStatus(`Esperando ${time} segundo(s)...`);
            await new Promise(resolve => setTimeout(resolve, time * 1000));
            break;

       // SECCIÓN 514: Simulación de Bloques de Entrada/Salida (IO)
       // Simula una operación de E/S con una breve espera para visualización.
       case 'set_do_block': case 'wait_di_block':
           updateStatus(`Ejecutando IO...`);
           await new Promise(resolve => setTimeout(resolve, 300));
           break;
       
       // SECCIÓN 515bis: Simulación de Paletizado Completo (Pick & Place)
       case 'palletize_block':
           {
               const pickPos = block.pick_pos || { x: 500, y: 0, z: 100 };
               const palletOrigin = block.pallet_origin || { x: 0, y: 300, z: 0 };
               const homePos = block.home_pos || null;
               
               const pickApproach = block.pick_approach_height ?? 50;
               const placeApproach = block.place_approach_height ?? 50;
               const gripperPin = block.gripper_pin ?? 1;
               const pickWait = block.pick_wait_time ?? 0.5;
               const placeWait = block.place_wait_time ?? 0.3;
               
               const rows = block.rows ?? 3;
               const cols = block.cols ?? 4;
               const layers = block.layers ?? 2;
               const boxX = block.box_x ?? 100;
               const boxY = block.box_y ?? 100;
               const spacingX = block.spacing_x ?? 10;
               const spacingY = block.spacing_y ?? 10;
               const layerHeight = block.layer_height ?? 60;
               
               updateStatus(`🔄 Paletizado Completo: ${rows}×${cols}×${layers} = ${rows*cols*layers} ciclos Pick & Place`);
               await new Promise(resolve => setTimeout(resolve, 500));
               
               let cycleNum = 1;
               for (let layer = 0; layer < layers; layer++) {
                   for (let row = 0; row < rows; row++) {
                       for (let col = 0; col < cols; col++) {
                           if (!isSimulating) break;
                           
                           updateStatus(`🔄 Ciclo ${cycleNum}/${rows*cols*layers} [Capa ${layer+1}, Fila ${row+1}, Col ${col+1}]`);
                           
                           // 1. Ir a HOME (si está definido)
                           if (homePos) {
                               const homeTarget = new THREE.Vector3(
                                   (homePos.x ?? 0) / 1000,
                                   (homePos.z ?? 0) / 1000,
                                   -(homePos.y ?? 0) / 1000
                               );
                               updateStatus(`🏠 HOME`);
                               await moveToPosition(homeTarget, moveJMaterial, 8);
                           }
                           
                           // 2. PICK - Aproximación
                           const pickApproachPos = new THREE.Vector3(
                               (pickPos.x ?? 0) / 1000,
                               ((pickPos.z ?? 0) + pickApproach) / 1000,
                               -(pickPos.y ?? 0) / 1000
                           );
                           updateStatus(`⬇️ PICK Aproximación (${pickPos.x}, ${pickPos.y}, ${(pickPos.z ?? 0) + pickApproach})`);
                           await moveToPosition(pickApproachPos, moveLMaterial, 10);
                           
                           // 3. PICK - Descenso
                           const pickTarget = new THREE.Vector3(
                               (pickPos.x ?? 0) / 1000,
                               (pickPos.z ?? 0) / 1000,
                               -(pickPos.y ?? 0) / 1000
                           );
                           updateStatus(`⬇️ PICK Descenso (${pickPos.x}, ${pickPos.y}, ${pickPos.z})`);
                           await moveToPosition(pickTarget, moveLMaterial, 12);
                           
                           // 4. PICK - Cerrar pinza
                           updateStatus(`✋ Cerrar Gripper DO[${gripperPin}]`);
                           await new Promise(resolve => setTimeout(resolve, pickWait * 1000));
                           
                           // 5. PICK - Levantar
                           updateStatus(`⬆️ PICK Levantar`);
                           await moveToPosition(pickApproachPos, moveLMaterial, 10);
                           
                           // 6. PLACE - Calcular posición
                           const placeX = (palletOrigin.x ?? 0) + col * (boxX + spacingX);
                           const placeY = (palletOrigin.y ?? 0) + row * (boxY + spacingY);
                           const placeZ = (palletOrigin.z ?? 0) + layer * layerHeight;
                           
                           // 7. PLACE - Aproximación
                           const placeApproachPos = new THREE.Vector3(
                               placeX / 1000,
                               (placeZ + placeApproach) / 1000,
                               -placeY / 1000
                           );
                           updateStatus(`➡️ PLACE Aproximación [${col+1},${row+1}] (${placeX.toFixed(0)}, ${placeY.toFixed(0)}, ${(placeZ + placeApproach).toFixed(0)})`);
                           await moveToPosition(placeApproachPos, moveJMaterial, 10);
                           
                           // 8. PLACE - Descenso
                           const placeTarget = new THREE.Vector3(
                               placeX / 1000,
                               placeZ / 1000,
                               -placeY / 1000
                           );
                           updateStatus(`⬇️ PLACE Descenso (${placeX.toFixed(0)}, ${placeY.toFixed(0)}, ${placeZ.toFixed(0)})`);
                           await moveToPosition(placeTarget, moveLMaterial, 12);
                           
                           // 9. PLACE - Abrir pinza
                           updateStatus(`🖐️ Abrir Gripper DO[${gripperPin}]`);
                           await new Promise(resolve => setTimeout(resolve, placeWait * 1000));
                           
                           // 10. PLACE - Levantar
                           updateStatus(`⬆️ PLACE Levantar`);
                           await moveToPosition(placeApproachPos, moveLMaterial, 10);
                           
                           updateStatus(`✅ Ciclo ${cycleNum} completado`);
                           cycleNum++;
                       }
                       if (!isSimulating) break;
                   }
                   if (!isSimulating) break;
               }
               
               updateStatus(`🎉 Paletizado Completo Finalizado: ${cycleNum-1} ciclos`);
           }
           break;

       // SECCIÓN 515: Simulación de Movimiento Circular (MoveC)
       // Calcula una curva cuadrática usando un punto intermedio y la recorre en segmentos.
       case 'move_circular_block':
           updateStatus(`Mover Circular...`);
             
             const startPointC = previousPosition.clone(); 
             const viaPos = new THREE.Vector3(
                 (block.via_x ?? 0) / 1000, (block.via_z ?? 0) / 1000, -(block.via_y ?? 0) / 1000
             );
             const endPosC = new THREE.Vector3(
                 (block.end_x ?? 0) / 1000, (block.end_z ?? 0) / 1000, -(block.end_y ?? 0) / 1000
             );

             if (isNaN(viaPos.x) || isNaN(viaPos.y) || isNaN(viaPos.z) ||
                 isNaN(endPosC.x) || isNaN(endPosC.y) || isNaN(endPosC.z)) {
                 statusText.textContent = "Error en datos de MoveC.";
                 isSimulating = false;
                 break;
             }

             // ✅ NUEVO: Rotación para MoveC (usar la rotación final)
             const endRotC = new THREE.Euler(
                 (block.end_rx ?? 0) * Math.PI / 180,
                 ((block.end_ry ?? 180) - 90) * Math.PI / 180,
                 (block.end_rz ?? 0) * Math.PI / 180
             );

             const numSegmentsC = 30;
             const curveC = new THREE.QuadraticBezierCurve3(startPointC, viaPos, endPosC);
             const pointsOnCurveC = curveC.getPoints(numSegmentsC); 
             const totalArcLength = curveC.getLength();
             const speedMs = block.speed ? (block.speed / 1000) : 0.1;
             const moveDuration = (speedMs > 0 && totalArcLength > 0) ? (totalArcLength / speedMs) * 1000 : 2000;
             const segmentDurationC = moveDuration / numSegmentsC;

             updateStatus(`Moviendo en arco (${numSegmentsC} segmentos)...`);
             
             let segmentStartPointC = startPointC;
             
             for (let i = 1; i < pointsOnCurveC.length; i++) {
                 if (!isSimulating) break;
                 const segmentEndPointC = pointsOnCurveC[i];
                 // ✅ ACTUALIZADO: Pasar rotación
                 await animateTCPMove(segmentEndPointC, endRotC, segmentDurationC);
                 drawTrajectoryLine(segmentStartPointC, currentPosition, moveCMaterial); 
                 segmentStartPointC.copy(currentPosition); 
             }
             
             if (isSimulating) {
                 tcpObject.position.copy(endPosC);
                 tcpObject.rotation.copy(endRotC);
                 currentPosition.copy(endPosC);
                 currentRotation.copy(endRotC);
                 markPoint(currentPosition);
             }
             break;
        
       // SECCIÓN 516: Manejo de Bloques no Reconocidos
       // Gestiona los tipos de bloque que no tienen una simulación visual implementada.
       default:
           updateStatus(`Bloque '${block.type}' no simulado.`);
           await new Promise(resolve => setTimeout(resolve, 100));
           break;
    }
}

// SECCIÓN 517: Inicialización y Manejo de Eventos Globales
// Asigna los listeners a los botones y maneja el redimensionamiento de la ventana.
runBtn.addEventListener('click', runProgramSimulation);
clearBtn.addEventListener('click', clearTrajectory);

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

init3D();