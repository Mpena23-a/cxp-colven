# Dashboard de Cuentas por Pagar · COLVEN

Panel interactivo de la deuda con proveedores y prestadores de servicios de **Colven Business & Corp.** (Dirección de Finanzas).

## Qué incluye

- **Acceso con contraseña**: al abrir el enlace aparece una ventana de contraseña y el panel queda difuminado hasta escribirla. Se pide una vez por pestaña del navegador.
- **Matriz de burbujas única**: eje X = importancia operativa (1 a 10, definida en mesa de trabajo entre Operaciones, Tesorería (Dir. Finanzas) y Procura), eje Y = histórico pagado (US $ PAGADO), tamaño de la burbuja = deuda vigente (US$ POR PAGAR). Escala vertical logarítmica (por defecto) o lineal. También hay una vista de **ranking de barras**.
- Cuadrantes: importancia alta (> 5) o baja × histórico alto (≥ promedio) o bajo. El cuadro «¿Desde cuándo se considera alto o bajo?» muestra los montos en USD.
- **Filtros**: nombre, tipo (proveedor / prestador / ambos), cuadrante, rango de importancia, orden y Top N.
- **Resumen** que cambia con los filtros, **aviso de doble categoría** (empresas que son proveedor y prestador, sin duplicar su deuda en el total) y sección de **calidad de datos**.
- **Análisis de la selección** dentro de la misma página: barras, dona, rosa, mapa de árbol, embudo y radar. Se vuelve a la matriz con el botón «Volver a la matriz», con el logo o con el botón Atrás del navegador.
- **Imágenes PNG** de cada gráfico y exportación CSV de la tabla.

## Actualizar los datos

1. El dashboard lee `data/SALDOS PEND X PAG PROVEE.xlsx`, hoja **POR PROVEEDOR** (encabezados en la fila donde dice PROVEEDOR).
2. Columnas que se leen (el orden no importa): `PROVEEDOR`, `US $ PAGADO` (histórico), `US$ POR PAGAR` (deuda), `IMPORTANCIA OPERATIVA` y `PROVEEDOR SUMINISTRO O SERVICIOS` (SUMINISTRO = proveedor, SERVICIOS = prestador, SUMINISTRO-SERVICIOS = ambos). La columna TOTAL y la fila TOTAL se ignoran.
3. Para actualizar, sube a la carpeta `data/` el Excel nuevo **con el mismo nombre** (reemplaza al anterior) y haz «Commit changes».
4. Cuando las cifras sean definitivas, en `js/config.js` cambia `datosDeEjemplo: false`.

> Saldos por pagar negativos (p. ej. TOP DRIVE) son **saldo a favor de Colven**: se muestran en un cuadro propio con el proveedor y el monto, y **no se restan de la deuda** (la deuda de ese proveedor figura en $0). Las empresas sin importancia operativa no aparecen en la matriz, pero sí en el ranking, la tabla y los totales.

`js/data-fallback.js` contiene una copia de los datos que se usa al abrir `index.html` con doble clic (sin servidor). En GitHub Pages siempre se lee el Excel.

## Contraseña

- La contraseña no está escrita en el código: `js/gate.js` guarda solo su huella SHA-256 (`HUELLA`).
- Para cambiarla: calcula el SHA-256 de la nueva contraseña (por ejemplo en https://emn178.github.io/online-tools/sha256.html), pega el resultado en `HUELLA` dentro de `js/gate.js` y sube el archivo.
- **Límite importante**: es una barrera visual. Quien conozca la dirección del Excel dentro del repositorio público podría descargarlo directamente. Para proteger cifras sensibles de verdad hace falta cifrar el archivo o usar un hosting privado.

## Publicar en GitHub Pages

1. Crea un repositorio (puede ser privado si tu plan lo permite) y sube **todo el contenido** de esta carpeta.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En 1–2 minutos estará disponible en `https://<usuario>.github.io/<repositorio>/`. Comparte ese enlace con la directiva.

> Importante: un sitio de GitHub Pages es público para quien tenga el enlace (salvo en planes Enterprise con Pages privado). Si las cifras reales son confidenciales, considera un repositorio con Pages privado o un hosting interno.

## Estructura

```
index.html            Panel principal
compare.html          Redirige a index.html (el análisis ahora está en la misma página)
css/                  Estilos (marca Colven)
js/config.js          Configuración editable
js/common.js          Lectura del Excel, cálculos y exportación de imágenes
js/app.js             Lógica del panel principal
js/analisis.js        Vista de análisis de la selección
js/gate.js            Pantalla de contraseña
js/data-fallback.js   Datos de respaldo (ejemplo)
data/                 Excel de origen
assets/               Logo e ícono
lib/                  ECharts 5.5.1 y SheetJS 0.18.5 (incluidas, funciona sin internet)
```
