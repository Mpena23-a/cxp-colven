# Dashboard de Cuentas por Pagar · COLVEN

Panel interactivo de la deuda con proveedores y prestadores de servicios de **Colven Business & Corp.** (Dirección de Finanzas).

## Qué incluye

- **Matriz de burbujas única**: eje X = importancia operativa, eje Y = histórico pagado, tamaño de la burbuja = deuda vigente (metodología de la minuta del 26-10-2026). También hay una vista de **ranking de barras**, con transición animada entre ambas.
- Cuadrantes: importancia alta (> celda B2) o baja × histórico alto (≥ promedio) o bajo.
- **Filtros**: nombre, tipo (proveedor / prestador / ambos), cuadrante, rango de importancia, orden (deuda, importancia, histórico, nombre) y Top N.
- **Resumen** que cambia con los filtros: cantidad de empresas, total deuda, total prestadores, total proveedores, composición, deuda por cuadrante y concentración.
- **Aviso de doble categoría**: lista las empresas que son proveedor y prestador a la vez, con su monto, para que esa deuda no se sume dos veces. El total nunca la duplica.
- **Ventana de análisis** (`compare.html`): con las empresas seleccionadas genera barras, dona, rosa, mapa de árbol, embudo y radar según el parámetro elegido.
- **Imágenes PNG** de cada gráfico: fondo Colven con resumen, fondo blanco para informes, o solo el gráfico con fondo transparente.
- Exportación CSV de la tabla filtrada.

## Actualizar los datos

1. Reemplaza `data/Matriz_Contratistas.xlsx` por el archivo real (hoja **Empresas**, encabezados en la fila 3).
2. Columnas que se leen (el orden no importa): `Empresa`, `Importancia operativa`, `Monto ($)` (deuda vigente), `Tipo` (Proveedor / Prestador de servicios / Ambos) y, opcional, `Histórico pagado ($)`.
3. En `js/config.js` cambia `datosDeEjemplo: false` y, si quieres, fija `fechaCorte` (p. ej. `'15 de noviembre de 2026'`).
4. Sube los cambios a GitHub. La página se actualiza sola.

> El botón **Cargar Excel** del panel permite previsualizar otro archivo solo en tu navegador, sin modificar el repositorio.

`js/data-fallback.js` contiene una copia de los datos de ejemplo que se usa al abrir `index.html` directamente desde el disco (sin servidor). En GitHub Pages siempre se lee el Excel.

## Publicar en GitHub Pages

1. Crea un repositorio (puede ser privado si tu plan lo permite) y sube **todo el contenido** de esta carpeta.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En 1–2 minutos estará disponible en `https://<usuario>.github.io/<repositorio>/`. Comparte ese enlace con la directiva.

> Importante: un sitio de GitHub Pages es público para quien tenga el enlace (salvo en planes Enterprise con Pages privado). Si las cifras reales son confidenciales, considera un repositorio con Pages privado o un hosting interno.

## Estructura

```
index.html            Panel principal
compare.html          Ventana de análisis de la selección
css/                  Estilos (marca Colven)
js/config.js          Configuración editable
js/common.js          Lectura del Excel, cálculos y exportación de imágenes
js/app.js             Lógica del panel principal
js/compare.js         Lógica de la ventana de análisis
js/data-fallback.js   Datos de respaldo (ejemplo)
data/                 Excel de origen
assets/               Logo e ícono
lib/                  ECharts 5.5.1 y SheetJS 0.18.5 (incluidas, funciona sin internet)
```
