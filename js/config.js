/* =====================================================================
   CONFIGURACIÓN DEL DASHBOARD — edita estos valores sin tocar el resto
   ===================================================================== */
window.COLVEN_CONFIG = {
  // Excel dentro de la carpeta data/ del repositorio. Para actualizar los datos,
  // sube a data/ el archivo nuevo con este MISMO nombre (reemplaza al anterior).
  archivoExcel: 'data/SALDOS PEND X PAG PROVEE.xlsx',

  // Importancia operativa (1-10): a partir de qué valor se considera "alta".
  // Alta = mayor que este número. Definida en mesa de trabajo Operaciones,
  // Tesorería (Dir. Finanzas) y Procura.
  divisoriaImportancia: 5,

  // Mientras sea true se muestra la cinta "Prototipo · cifras de ejemplo".
  // Cámbialo a false cuando subas el Excel con la deuda real.
  datosDeEjemplo: true,

  // Fecha de corte que aparece en el encabezado y en las imágenes exportadas.
  // Déjalo vacío ('') para usar la fecha de hoy.
  fechaCorte: '',

  // Moneda
  moneda: 'USD',
  simbolo: '$',

  // Etiquetas
  empresa: 'Colven Business & Corp.',
  area: 'Dirección de Finanzas',
};
