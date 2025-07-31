window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('pantalla-carga').style.display = 'none';
  }, 1200);
});

const ejercicios = {
  sentadilla: {
    nombre: "Sentadilla",
    descripcion: "Ejercicio fundamental para trabajar piernas y glúteos. Mantén la espalda recta y baja hasta que tus muslos estén paralelos al suelo.",
    imagen: "img/squat.jpg",
    video: "videos/squat-demo.mp4"
  },
  // Puedes añadir más ejercicios aquí
};

const pantallaEjercicios = document.getElementById('pantalla-ejercicios');
const pantallaDetalle = document.getElementById('pantalla-detalle');
const volverBtn = document.getElementById('volverBtn');
const nombreEjercicio = document.getElementById('nombreEjercicio');
const videoDemo = document.getElementById('videoDemo');
const userForm = document.getElementById('userForm');
const pantallaCamara = document.getElementById('pantalla-camara');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const video = document.getElementById('video');
const infoPanel = document.getElementById('info');
const volverInicioBtn = document.getElementById('volverInicioBtn');

let ejercicioActual = null;
let stream = null;
let useFrontCamera = false;

let reps = 0, completas = 0, incompletas = 0, bajando = false, ultimaY = null;
let velocidades = [], minY = null, maxY = null, startTime = null;
let tiempoEjercicioMs = 0, enMovimiento = false, ultimoMovimiento = null;
let escalaPxACm = 1, alturaPersonaPx = null;
let detector = null, rafId = null;
let pesoCorporal = 70, alturaCorporal = 170, pesoExtra = 0;

// --- FLUJO DE PANTALLAS ---
document.querySelectorAll('.ejercicio').forEach(div => {
  div.addEventListener('click', () => {
    ejercicioActual = div.getAttribute('data-ejercicio');
    const ej = ejercicios[ejercicioActual];
    pantallaEjercicios.style.display = 'none';
    pantallaDetalle.style.display = 'block';
    nombreEjercicio.textContent = ej.nombre;
    videoDemo.src = ej.video;
    videoDemo.poster = ej.imagen;
    document.getElementById('descripcionEjercicio').textContent = ej.descripcion;
    userForm.style.display = 'flex';
    pantallaCamara.style.display = 'none';
    infoPanel.style.display = 'none';
  });
});

volverBtn.addEventListener('click', () => {
  pantallaDetalle.style.display = 'none';
  pantallaEjercicios.style.display = 'block';
  videoDemo.pause();
});

volverInicioBtn.addEventListener('click', () => {
  infoPanel.style.display = 'none';
  pantallaDetalle.style.display = 'none';
  pantallaEjercicios.style.display = 'block';
  videoDemo.pause();
});

// --- FORMULARIO ---
userForm.addEventListener('submit', function(e) {
  e.preventDefault();
  pesoCorporal = parseFloat(document.getElementById('pesoCorporal').value) || 70;
  alturaCorporal = parseFloat(document.getElementById('alturaCorporal').value) || 170;
  pesoExtra = parseFloat(document.getElementById('pesoExtra').value) || 0;
  userForm.style.display = 'none';
  pantallaCamara.style.display = 'flex';
});

// --- CÁMARA ---
startCameraBtn.addEventListener('click', async () => {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFrontCamera ? "user" : "environment" }, audio: false
    });
    video.srcObject = stream;
    startCameraBtn.style.display = 'none';
    stopCameraBtn.style.display = 'flex';

    // Reset métricas
    reps = 0; completas = 0; incompletas = 0; bajando = false; ultimaY = null;
    velocidades = []; minY = null; maxY = null; startTime = null;
    tiempoEjercicioMs = 0; enMovimiento = false; ultimoMovimiento = null;
    escalaPxACm = 1; alturaPersonaPx = null;

    document.getElementById('reps').textContent = '0';
    document.getElementById('completas').textContent = '0';
    document.getElementById('incompletas').textContent = '0';
    document.getElementById('calidad').textContent = '-';
    document.getElementById('velocidad').textContent = '0';
    document.getElementById('fatiga').textContent = '-';
    document.getElementById('profundidad').textContent = '-';
    document.getElementById('esfuerzo').textContent = '0';
    document.getElementById('tiempo').textContent = '-';
    document.getElementById('rango').textContent = '-';

    await tf.setBackend('webgl');
    detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet);

    analizar();
  } else {
    alert('Tu navegador no soporta la cámara.');
  }
});

stopCameraBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    stream = null;
  }
  stopCameraBtn.style.display = 'none';
  startCameraBtn.style.display = 'flex';
  pantallaCamara.style.display = 'none';
  mostrarResultados();
  infoPanel.style.display = 'block';
  cancelAnimationFrame(rafId);
});

switchCameraBtn.addEventListener('click', async () => {
  useFrontCamera = !useFrontCamera;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: useFrontCamera ? "user" : "environment" }, audio: false
  });
  video.srcObject = stream;
});

// --- ANÁLISIS Y RESULTADOS ---
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
          document.getElementById('reps').textContent = reps;
          if (angle < 120) {
            completas++;
            document.getElementById('completas').textContent = completas;
          } else {
            incompletas++;
            document.getElementById('incompletas').textContent = incompletas;
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
  const fps = 30;
  const mediaVelCm = mediaVel * escalaPxACm * fps;
  document.getElementById('velocidad').textContent = mediaVelCm.toFixed(2) + ' cm/s';

  const fatiga =
    mediaVel < 1 ? 'Alta' :
    mediaVel < 3 ? 'Media' : 'Baja';
  document.getElementById('fatiga').textContent = fatiga;

  const calidad = reps > 0 ? (completas / reps) * 100 : 0;
  document.getElementById('calidad').textContent = calidad.toFixed(1) + '%';

  const profundidad = maxY !== null && minY !== null ? (maxY - minY) : 0;
  const profundidadCm = profundidad * escalaPxACm;
  const profundidadM = profundidadCm / 100;

  document.getElementById('profundidad').textContent = profundidadCm.toFixed(1) + ' cm';
  document.getElementById('rango').textContent = profundidadCm.toFixed(1) + ' cm';

  const esfuerzo = velocidades.reduce((a, b) => a + b, 0);
  const esfuerzoCm = esfuerzo * escalaPxACm;
  document.getElementById('esfuerzo').textContent = esfuerzoCm.toFixed(1) + ' cm';

  const tiempo = (tiempoEjercicioMs / 1000).toFixed(1);
  document.getElementById('tiempo').textContent = tiempo + 's';

  // Calorías reales
  const pesoTotal = pesoCorporal + pesoExtra;
  const repeticiones = completas;
  const g = 9.81;
  const eficiencia = 0.25;
  const trabajo = pesoTotal * g * profundidadM * repeticiones;
  const kcal = trabajo / (eficiencia * 4184);
  document.getElementById('esfuerzo').textContent += ` (${kcal.toFixed(2)} kcal reales)`;

  // 1RM
  const oneRM = completas > 0 ? pesoTotal * (1 + completas / 30) : 0;
  document.getElementById('fatiga').textContent += ` | 1RM: ${oneRM.toFixed(1)} kg`;
}

// --- ÁNGULO ---
function getAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
  const angle = Math.acos(dot / (magAB * magCB));
  return angle * (180 / Math.PI);
}
