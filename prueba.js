/* Batería de pruebas: ejecuta la app en un navegador simulado.
   Detecta funciones llamadas pero no definidas y recorre los 3 modos. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fallas = 0;
function ok(nombre, cond, extra){
  console.log((cond ? '  OK  ' : ' FALLA') + ' | ' + nombre + (extra ? ' → ' + extra : ''));
  if (!cond) fallas++;
}

/* ---- 1. Barrido: funciones llamadas pero no definidas ---- */
let js = fs.readFileSync('app.js', 'utf8');
// quitar comentarios y textos entre comillas: ahí no hay llamadas reales
js = js.replace(/\/\*[\s\S]*?\*\//g, ' ')
       .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
       .replace(/'(?:\\.|[^'\\])*'/g, "''")
       .replace(/"(?:\\.|[^"\\])*"/g, '""');
const definidas = new Set();
let m;
const reDef = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = reDef.exec(js))) definidas.add(m[1]);
const reVar = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function/g;
while ((m = reVar.exec(js))) definidas.add(m[1]);
// los parámetros de cada función también son invocables
const rePar = /function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g;
while ((m = rePar.exec(js))) m[1].split(',').forEach(p => { p = p.trim(); if (p) definidas.add(p); });

const globales = new Set(['if','for','while','switch','catch','return','typeof','function',
  'parseInt','parseFloat','String','Number','Boolean','Array','Object','JSON','Date','Math',
  'setTimeout','clearTimeout','setInterval','clearInterval','encodeURIComponent','decodeURIComponent','isNaN','Blob','Error',
  'RegExp','fetch','require','console','alert']);
const llamadas = new Set();
const reCall = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = reCall.exec(js))) llamadas.add(m[1]);
const huerfanas = [...llamadas].filter(f => !definidas.has(f) && !globales.has(f));
ok('Sin funciones llamadas y no definidas', huerfanas.length === 0, huerfanas.join(', '));

/* ---- 2. Ejecutar la app ---- */
const html = fs.readFileSync('index.html', 'utf8');

const DIRECTORIO_FALSO = [
  ['D001','ANA DIRECTORA','LAGUNA','DIRECTOR DISTRITAL','',''],
  ['L001','LUIS LIDER','LAGUNA','LIDER DE VENTAS','D001','ANA DIRECTORA'],
  ['C001','CARLA COACH','LAGUNA','COACH VENTAS','L001','LUIS LIDER'],
  ['V001','VICTOR VENDEDOR','LAGUNA','VENDEDOR','C001','CARLA COACH'],
  ['SLK55','SARA TECNICO','LAGUNA','VENDEDOR','C001','CARLA COACH'],
  ['A001','ADRIAN ADMIN','LAGUNA','ANALISTA','C001','CARLA COACH']
];

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://ejemplo.test/' });
const w = dom.window, d = w.document;

/* Buzón simulado */
const enviados = [];
w.navigator.sendBeacon = function(url, blob){ enviados.push(String(url)); return true; };
const REPORTE_FALSO = { ok:true,
  sesiones:[{ sesion:'S1', numero:'V001', nombre:'VICTOR VENDEDOR', modo:'cuestionario',
              inicio:'2026-07-27T10:00:00', fin:'2026-07-27T10:12:00', minutos:12,
              items:5, aciertos:4, errores:1, calificacion:80 }],
  fallas:[{ item:'planes-p2', tema:'planes', titulo:'¿Desde qué plan las apps van sin anuncios?',
            bien:1, mal:4, veces:5, porcentajeError:80, segundosPromedio:21 }] };
let MODO_BUZON = 'ok';   // 'ok' | 'login' | 'muerto'
w.fetch = function(url){
  if (String(url).indexOf('fn=todo') < 0) return Promise.resolve({ ok:true, status:200 });
  if (MODO_BUZON === 'muerto') return Promise.reject(new Error('Failed to fetch'));
  if (MODO_BUZON === 'login') return Promise.resolve({ status:200,
    text: () => Promise.resolve('<!DOCTYPE html><html>Inicia sesión</html>') });
  return Promise.resolve({ status:200, text: () => Promise.resolve(JSON.stringify(REPORTE_FALSO)) });
};

/* Interceptar los <script> de JSONP (directorio y reporte) */
const origAppend = d.head.appendChild.bind(d.head);
d.head.appendChild = function(nodo){
  if (nodo.tagName === 'SCRIPT' && nodo.src){
    const src = nodo.src;
    setTimeout(function(){
      const cb = /responseHandler:([\w$]+)/.exec(src);
      const cb2 = /callback=([\w$]+)/.exec(src);
      if (cb && w[cb[1]]){
        w[cb[1]]({ table: { rows: DIRECTORIO_FALSO.map(f => ({ c: f.map(v => ({ v })) })) } });
      } else if (cb2 && w[cb2[1]]){
        if (MODO_BUZON === 'muerto'){ if (nodo.onerror) nodo.onerror(); }
        else w[cb2[1]](REPORTE_FALSO);
      }
      return nodo;
    }, 0);
    return nodo;
  }
  return origAppend(nodo);
};

const espera = ms => new Promise(r => setTimeout(r, ms));

(async function(){
  await espera(60);
  ok('Pantalla de acceso visible', !d.getElementById('acceso').classList.contains('oculto'));
  ok('Directorio cargado', /personal con acceso/.test(d.getElementById('avisoAcceso').textContent),
     d.getElementById('avisoAcceso').textContent);

  /* Número inválido */
  d.getElementById('numero').value = 'XXXXX';
  d.getElementById('btnEntrar').click();
  ok('Rechaza número sin acceso', /no tiene acceso/.test(d.getElementById('avisoAcceso').textContent));

  /* Número con letras */
  d.getElementById('numero').value = 'slk55';
  d.getElementById('btnEntrar').click();
  ok('Acepta clave con letras', d.getElementById('app').classList.contains('oculto') === false);
  ok('Sale la vista de bienvenida', !!d.getElementById('continuar'));
  ok('La bienvenida muestra nombre, puesto y distrito',
     /SARA TECNICO/.test(d.getElementById('vista').textContent) &&
     /VENDEDOR/.test(d.getElementById('vista').textContent) &&
     /LAGUNA/.test(d.getElementById('vista').textContent));
  ok('El logo son 6 triángulos', d.querySelectorAll('.selloChico polygon').length === 6);
  ok('La caja del número pide 8 ceros', d.getElementById('numero').placeholder === '00000000');
  d.getElementById('continuar').click();

  /* A partir de aquí, un vendedor normal sin prefijo técnico */
  d.getElementById('btnSalir').click();
  d.getElementById('numero').value = 'V001';
  d.getElementById('btnEntrar').click();
  ok('Entra un vendedor normal', !d.getElementById('app').classList.contains('oculto'));
  d.getElementById('continuar').click();

  /* Un VENDEDOR no debe ver el botón de reportes */
  ok('Vendedor NO ve el modo reporte', !d.querySelector('[data-ir="reporte"]'));
  ok('Vendedor SÍ ve tarjetas y cuestionario',
     !!d.querySelector('[data-ir="tarjetas"]') && !!d.querySelector('[data-ir="cuestionario"]'));

  /* --- Modo tarjetas, recorrido completo de un tema --- */
  d.querySelector('[data-ir="tarjetas"]').click();
  const temasBotones = d.querySelectorAll('[data-tema]');
  ok('Lista de temas pintada', temasBotones.length > 0, temasBotones.length + ' temas');
  ok('Vendedor SÍ ve Comisiones', !!d.querySelector('[data-tema="comisiones"]'));
  ok('Vendedor SÍ ve Bono semanal', !!d.querySelector('[data-tema="bono"]'));
  ok('Vendedor NO ve Venta Técnico', !d.querySelector('[data-tema="tecnico"]'));

  d.querySelector('[data-tema="blacknut"]').click();
  ok('Tarjeta pintada', !!d.getElementById('carta'));
  ok('Aparecen los cuatro controles',
     !!d.getElementById('btnAnterior') && !!d.getElementById('btnMal') &&
     !!d.getElementById('btnBien') && !!d.getElementById('btnSiguiente'));
  ok('En la primera tarjeta la flecha de atrás está apagada',
     d.getElementById('btnAnterior').hasAttribute('disabled'));

  /* Voltear y regresar */
  d.getElementById('voltear').click();
  ok('La tarjeta se voltea', d.getElementById('carta').className.indexOf('volteada') >= 0);
  d.getElementById('voltear').click();
  ok('La tarjeta se puede regresar a la pregunta',
     d.getElementById('carta').className.indexOf('volteada') < 0);

  /* Avanzar sin calificarse y regresar con la flecha */
  d.getElementById('btnSiguiente').click();
  ok('La flecha avanza sin calificar', /^2 \//.test(d.querySelector('.progreso').textContent));
  d.getElementById('btnAnterior').click();
  ok('La flecha de atrás regresa', /^1 \//.test(d.querySelector('.progreso').textContent));

  /* Contadores */
  d.getElementById('btnMal').click();
  ok('El contador de ✕ sube', /✕ 1/.test(d.getElementById('btnMal').textContent));
  d.getElementById('btnAnterior').click();
  d.getElementById('btnBien').click();
  ok('Recalificar una tarjeta no la cuenta dos veces',
     /✕ 0/.test(d.getElementById('btnMal').textContent) &&
     /1 ✓/.test(d.getElementById('btnBien').textContent));

  let vueltas = 0;
  while (d.getElementById('btnBien') && vueltas < 40){
    d.getElementById('btnBien').click();
    vueltas++;
  }
  ok('Terminó el tema de tarjetas', !!d.getElementById('alQuiz'), vueltas + ' avances');
  ok('El resumen muestra aciertos y por repasar',
     /por repasar/.test(d.querySelector('.marcador').textContent));
  ok('Se mandó la bitácora de tarjetas', enviados.length > 0, enviados.length + ' envíos');

  /* --- Modo cuestionario desde el final de las tarjetas --- */
  d.getElementById('alQuiz').click();
  ok('Cuestionario iniciado', d.querySelectorAll('[data-op]').length === 4);
  let preguntas = 0;
  while (d.querySelectorAll('[data-op]').length && preguntas < 60){
    d.querySelector('[data-op="0"]').click();
    ok.silencio = true;
    if (!d.getElementById('sig')) break;
    d.getElementById('sig').click();
    preguntas++;
  }
  ok('Terminó el cuestionario y calificó', /%/.test(d.querySelector('.marcador') ?
     d.querySelector('.marcador').textContent : ''), preguntas + ' preguntas');

  /* --- Cuestionario completo (mezcla de temas) --- */
  d.getElementById('alMenu').click();
  d.querySelector('[data-ir="cuestionario"]').click();
  ok('Existe el cuestionario completo', !!d.querySelector('[data-tema="TODOS"]'));
  d.querySelector('[data-tema="TODOS"]').click();
  ok('Cuestionario completo arranca', d.querySelectorAll('[data-op]').length === 4);

  /* --- Entrar como jefe: reporte por niveles --- */
  d.getElementById('volver').click();
  d.getElementById('volver').click();
  d.getElementById('btnSalir').click();
  d.getElementById('numero').value = 'D001';
  d.getElementById('btnEntrar').click();
  d.getElementById('continuar').click();
  ok('Director SÍ ve el modo reporte', !!d.querySelector('[data-ir="reporte"]'));
  ok('El botón dice "Ver resultados de mi equipo"',
     /Ver resultados de mi equipo/.test(d.getElementById('vista').textContent));

  /* Buzón caído: debe salir la pantalla de diagnóstico, no un error seco */
  MODO_BUZON = 'muerto';
  d.querySelector('[data-ir="reporte"]').click();
  await espera(200);
  ok('Con el buzón caído sale el diagnóstico', /paso por paso/.test(d.getElementById('vista').textContent));
  ok('El diagnóstico explica lo de "Cualquier persona"',
     /Cualquier persona/.test(d.getElementById('vista').textContent));
  ok('Ofrece volver a intentar', !!d.getElementById('reintentar'));

  /* Buzón que pide iniciar sesión: cae al camino alterno y sí carga */
  MODO_BUZON = 'login';
  d.getElementById('reintentar').click();
  await espera(150);
  ok('Si Google devuelve una pantalla de sesión, el camino alterno rescata la carga',
     !!d.querySelector('.cifras'));

  /* Buzón sano por conexión directa */
  MODO_BUZON = 'ok';
  w.DATOS_REPORTE = null;
  d.getElementById('atras').click();
  d.querySelector('[data-ir="reporte"]').click();
  await espera(120);
  ok('Reporte pintado', !!d.querySelector('.cifras'));
  const fichas = d.querySelectorAll('[data-num]');
  ok('Director ve solo a su línea directa', fichas.length === 1,
     [...fichas].map(f => f.getAttribute('data-num')).join(','));
  ok('Aparece lo que más falla', /más falla/.test(d.getElementById('vista').textContent));

  /* Bajar un nivel: líder → coach */
  fichas[0].click();
  const fichas2 = d.querySelectorAll('[data-num]');
  ok('Segundo nivel: el líder ve a su coach', fichas2.length === 1,
     [...fichas2].map(f => f.getAttribute('data-num')).join(','));
  fichas2[0].click();
  const fichas3 = d.querySelectorAll('[data-num]');
  ok('Tercer nivel: el coach ve a sus 3 colaboradores', fichas3.length === 3,
     [...fichas3].map(f => f.getAttribute('data-num')).join(','));
  d.getElementById('atras').click();
  ok('El botón Volver regresa un nivel', d.querySelectorAll('[data-num]').length === 1);

  /* --- Permisos por prefijo de número --- */
  d.getElementById('btnSalir').click();
  d.getElementById('numero').value = 'SLK55';
  d.getElementById('btnEntrar').click();
  d.getElementById('continuar').click();
  d.querySelector('[data-ir="tarjetas"]').click();
  ok('Prefijo SLK SÍ ve Venta Técnico', !!d.querySelector('[data-tema="tecnico"]'));

  /* --- Puesto sin permiso --- */
  d.getElementById('volver').click();
  d.getElementById('btnSalir').click();
  d.getElementById('numero').value = 'A001';
  d.getElementById('btnEntrar').click();
  d.getElementById('continuar').click();
  d.querySelector('[data-ir="tarjetas"]').click();
  ok('Puesto sin permiso no ve Comisiones, Bono ni Técnico',
     !d.querySelector('[data-tema="comisiones"]') && !d.querySelector('[data-tema="bono"]') &&
     !d.querySelector('[data-tema="tecnico"]'));
  ok('Puesto sin permiso SÍ ve el resto', !!d.querySelector('[data-tema="planes"]'));

  /* --- Vigencia vencida --- */
  w.VIGENCIAS.fox = '2020-01-01';
  d.getElementById('volver').click();
  d.querySelector('[data-ir="tarjetas"]').click();
  ok('Tema vencido se oculta al personal', !d.querySelector('[data-tema="fox"]'));

  d.getElementById('volver').click();
  d.getElementById('btnSalir').click();
  d.getElementById('numero').value = 'D001';
  d.getElementById('btnEntrar').click();
  d.getElementById('continuar').click();
  ok('El Director recibe el aviso de vigencia vencida',
     /Terminó la vigencia/.test(d.getElementById('vista').textContent));
  d.querySelector('[data-ir="tarjetas"]').click();
  const fox = d.querySelector('[data-tema="fox"]');
  ok('El Director SÍ ve el tema vencido, marcado', !!fox && /venció/.test(fox.textContent));
  ok('El cuestionario completo excluye lo vencido',
     w.temasParaExamen().every(t => t.id !== 'fox'));
  w.VIGENCIAS.fox = '2026-07-31';

  /* --- Contenido restringido --- */
  d.getElementById('volver').click();
  d.getElementById('btnSalir').click();
  console.log('\n--- Resumen del contenido ---');
  const temas = w.TEMAS;
  let tt = 0, tp = 0;
  temas.forEach(t => {
    tt += t.tarjetas.length; tp += t.preguntas.length;
    const malas = t.preguntas.filter(q => !(q.r >= 0 && q.r < q.o.length) || !q.x || q.o.length !== 4);
    if (malas.length) { console.log('  ¡Revisar!', t.id, malas.length); fallas++; }
    console.log('  ' + t.id.padEnd(12) + t.tarjetas.length + ' tarjetas · ' + t.preguntas.length + ' preguntas');
  });
  console.log('  TOTAL: ' + tt + ' tarjetas · ' + tp + ' preguntas');
  ok('Todas las preguntas tienen 4 opciones, respuesta válida y explicación', true);

  console.log('\n' + (fallas ? '❌ ' + fallas + ' fallas' : '✅ Todas las pruebas pasaron'));
  process.exit(fallas ? 1 : 0);
})();
