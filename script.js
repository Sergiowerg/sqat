const videoInput = document.getElementById('videoInput');
const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');

const repsDisplay = document.getElementById('reps');
const completasDisplay = document.getElementById('completas');
const calidadDisplay = document.getElementById('calidad');
const velocidadDisplay = document.getElementById('velocidad');
const fatigaDisplay = document.getElementById('fatiga');
const profundidadDisplay = document.getElementById('profundidad');
const esfuerzoDisplay = document.getElementById('esfuerzo');
const tiempoDisplay = document.getElementById('tiempo');
const incompletasDisplay = document.getElementById('incompletas');
const rangoDisplay = document.getElementById('rango');

let detector;
let reps = 0;
let completas = 0;
let bajando = false;
let ultimaY = null;
let velocidades = [];
let startTime = null;
let minY = null;
let maxY = null;
let incompletas = 0;
let rafId = null;

let pesoCorporal = 70;
let alturaCorporal = 170;
let pesoExtra = 0;

const pantallaEjercicio = document.getElementById('pantalla-ejercicio');
const userForm = document.getElementById('userForm');
const pantallaCamara = document.getElementById('pantalla-camara');
const infoPanel = document.getElementById('info');

// Paso 1: Elegir ejercicio
document.getElementById('btnSquat').addEventListener('click', () => {
  pantallaEjercicio.style.display = 'none';
  userForm.style.display = 'block';
});

// Paso 2: Formulario
userForm.addEventListener('submit', function(e) {
  e.preventDefault();
  pesoCorporal = parseFloat(document.getElementById('pesoCorporal').value) || 70;
  alturaCorporal = parseFloat(document.getElementById('alturaCorporal').value) || 170;
  pesoExtra = parseFloat(document.getElementById('pesoExtra').value) || 0;
  userForm.style.display = 'none';
  pantallaCamara.style.display = 'block';
});

// Paso 3: Cámara y análisis
startCameraBtn.addEventListener('click', async () => {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = stream;
    startCameraBtn.style.display = 'none';
    stopCameraBtn.style.display = 'inline-block';

    // Reset variables
    reps = 0;
    completas = 0;
    incompletas = 0;
    bajando = false;
    ultimaY = null;
    velocidades = [];
    minY = null;
    maxY = null;
    startTime = null;
    tiempoEjercicioMs = 0;
    enMovimiento = false;
    ultimoMovimiento = null;
    escalaPxACm = 1;
    alturaPersonaPx = null;

    repsDisplay.textContent = '0';
    completasDisplay.textContent = '0';
    incompletasDisplay.textContent = '0';
    calidadDisplay.textContent = '-';
    velocidadDisplay.textContent = '0';
    fatigaDisplay.textContent = '-';
    profundidadDisplay.textContent = '-';
    esfuerzoDisplay.textContent = '0';
    tiempoDisplay.textContent = '-';
    rangoDisplay.textContent = '-';

    await tf.setBackend('webgl');
    detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet);

    analizar();
  } else {
    alert('Tu navegador no soporta la cámara.');
  }
});

// Paso 4: Finalizar y mostrar resultados
stopCameraBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    stream = null;
  }
  stopCameraBtn.style.display = 'none';
  startCameraBtn.style.display = 'inline-block';
  pantallaCamara.style.display = 'none';
  mostrarResultados();
  infoPanel.style.display = 'block';
  cancelAnimationFrame(rafId);
});

let escalaPxACm = 1; // Inicialización global
let alturaPersonaPx = null; // Para guardar la altura en píxeles

async function analizar() {
  if (video.paused || video.ended) return;

  if (!startTime) startTime = performance.now();

  const poses = await detector.estimatePoses(video, {maxPoses: 1, flipHorizontal: false});
  if (poses.length > 0) {
    const keypoints = poses[0].keypoints;
    const cadera = keypoints.find(k => k.name === 'left_hip') || keypoints[11];
    const rodilla = keypoints.find(k => k.name === 'left_knee') || keypoints[13];
    const tobillo = keypoints.find(k => k.name === 'left_ankle') || keypoints[15];
    const cabeza = keypoints.find(k => k.name === 'nose') || keypoints[0];

    // Calcula la altura en píxeles solo una vez (primer frame válido)
    if (cabeza && tobillo && cabeza.score > 0.3 && tobillo.score > 0.3 && !alturaPersonaPx) {
      alturaPersonaPx = Math.abs(cabeza.y - tobillo.y);
      escalaPxACm = alturaCorporal / alturaPersonaPx;
    }

    if (cadera && rodilla && tobillo && cadera.score > 0.3 && rodilla.score > 0.3 && tobillo.score > 0.3) {
      const y = cadera.y;

      if (minY === null || y < minY) minY = y;
      if (maxY === null || y > maxY) maxY = y;

      const angle = getAngle(cadera, rodilla, tobillo);

      if (ultimaY !== null) {
        const deltaY = y - ultimaY;
        velocidades.push(Math.abs(deltaY));

        // Detecta movimiento relevante
        if (Math.abs(deltaY) > 2) {
          if (!enMovimiento) {
            enMovimiento = true;
            ultimoMovimiento = performance.now();
          }
        } else {
          if (enMovimiento) {
            tiempoEjercicioMs += performance.now() - ultimoMovimiento;
            enMovimiento = false;
          }
        }

        if (deltaY > 2 && angle < 120) {
          bajando = true;
        } else if (deltaY < -2 && bajando) {
          reps++;
          repsDisplay.textContent = reps;
          if (angle < 120) {
            completas++;
            completasDisplay.textContent = completas;
          } else {
            incompletas++;
            incompletasDisplay.textContent = incompletas;
          }
          bajando = false;
        }
      }
      ultimaY = y;
    }
  }

  rafId = requestAnimationFrame(analizar);
}

function mostrarResultados() {
  if (enMovimiento && ultimoMovimiento) {
    tiempoEjercicioMs += performance.now() - ultimoMovimiento;
    enMovimiento = false;
  }

  const mediaVel = velocidades.reduce((a, b) => a + b, 0) / velocidades.length || 0;

  // Calcula la velocidad media en cm/s
  const fps = 30; // Puedes ajustar si sabes el fps real
  const mediaVelCm = mediaVel * escalaPxACm * fps;
  velocidadDisplay.textContent = mediaVelCm.toFixed(2) + ' cm/s';

  const fatiga =
    mediaVel < 1 ? 'Alta' :
    mediaVel < 3 ? 'Media' : 'Baja';
  fatigaDisplay.textContent = fatiga;

  const calidad = reps > 0 ? (completas / reps) * 100 : 0;
  calidadDisplay.textContent = calidad.toFixed(1) + '%';

  // Profundidad media y rango en píxeles
  const profundidad = maxY !== null && minY !== null ? (maxY - minY) : 0;
  const profundidadCm = profundidad * escalaPxACm;
  const profundidadM = profundidadCm / 100;

  profundidadDisplay.textContent = profundidadCm.toFixed(1) + ' cm';
  rangoDisplay.textContent = profundidadCm.toFixed(1) + ' cm';

  // Esfuerzo total en píxeles y en cm
  const esfuerzo = velocidades.reduce((a, b) => a + b, 0);
  const esfuerzoCm = esfuerzo * escalaPxACm;
  esfuerzoDisplay.textContent = esfuerzoCm.toFixed(1) + ' cm';

  // Tiempo real de ejercicio en segundos
  const tiempo = (tiempoEjercicioMs / 1000).toFixed(1);
  tiempoDisplay.textContent = tiempo + 's';

  // --- Cálculo realista de calorías gastadas ---
  const pesoTotal = pesoCorporal + pesoExtra; // kg
  const repeticiones = completas;
  const g = 9.81; // gravedad m/s²
  const eficiencia = 0.25; // eficiencia humana

  // Trabajo mecánico total (Joules)
  const trabajo = pesoTotal * g * profundidadM * repeticiones; // J

  // Calorías gastadas (kcal)
  const kcal = trabajo / (eficiencia * 4184);

  esfuerzoDisplay.textContent += ` (${kcal.toFixed(2)} kcal reales)`;

  // Estimación de 1RM (Epley): 1RM = peso * (1 + repeticiones/30)
  const oneRM = completas > 0 ? pesoTotal * (1 + completas / 30) : 0;
  fatigaDisplay.textContent += ` | 1RM: ${oneRM.toFixed(1)} kg`;
}

// Calcula el ángulo entre tres puntos (cadera, rodilla, tobillo)
function getAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
  const angle = Math.acos(dot / (magAB * magCB));
  return angle * (180 / Math.PI);
}