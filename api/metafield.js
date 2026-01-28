<div id="sucursales-accordion-wrapper" class="sucursales-accordion" style="display:none;">
  <button class="accordion-header" onclick="toggleSucursales()" style="width:100%;border:none;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;font-size:16px;text-align:left;cursor:pointer;padding:1rem 0;font-weight:600;background:transparent;color:#000">
    <span>Disponibilidad en Sucursales</span>
    <svg id="accordion-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" style="transition: transform 0.3s; flex-shrink: 0; margin-left: 10px;"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
  </button>
  <div id="sucursales-content" style="max-height: 0; overflow: hidden; transition: max-height 0.3s; width: 100%;">
    <div style="padding:1rem 0;width:100%">
      <div id="sucursales-table-container" style="width:100%"></div>
    </div>
  </div>
</div>

<script>
let isOpen = false;
function toggleSucursales(){
  const content = document.getElementById('sucursales-content');
  const icon = document.getElementById('accordion-icon');
  isOpen = !isOpen;
  content.style.maxHeight = isOpen ? content.scrollHeight + 'px' : '0';
  icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0)';
}

// Función que trae sucursales desde la API de Vercel
async function loadSucursales(handle){
  try {
    const res = await fetch(`/api/metafield?handle=${handle}`);
    const json = await res.json();
    if(!json.ok || !json.sucursales) return;

    const wrapper = document.getElementById('sucursales-accordion-wrapper');
    const container = document.getElementById('sucursales-table-container');
    
    // Render tabla
    container.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f8f8f8">
        <th style="padding:12px;text-align:left;border-bottom:2px solid #e0e0e0;font-weight:600">Sucursal</th>
        <th style="padding:12px;text-align:center;border-bottom:2px solid #e0e0e0;font-weight:600">Stock</th>
        <th style="padding:12px;text-align:center;border-bottom:2px solid #e0e0e0;font-weight:600">Ubicación</th>
      </tr></thead>
      <tbody>
        ${json.sucursales.map(s => `
          <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:14px 12px"><strong>${s.nombre}</strong></td>
            <td style="padding:14px 12px;text-align:center"><span style="color:#2e7d32;font-weight:500">${s.cantidad}</span></td>
            <td style="padding:14px 12px;text-align:center"><a href="https://www.google.com/maps/search/${encodeURIComponent(s.nombre)}" target="_blank" rel="noopener" style="display:inline-block;padding:6px 14px;background:#7EB4C1;color:#fff;text-decoration:none;border-radius:1px;font-size:14px">Ver mapa</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;

    wrapper.style.display = 'block'; // Forzar siempre que se vea

  } catch(e){
    console.error('Error cargando sucursales:', e);
  }
}

// Llamar a la función con el handle del producto actual
const productHandle = document.querySelector('input[name="handle"]')?.value || 'cama-luton';
loadSucursales(productHandle);
</script>

<style>
#sucursales-accordion-wrapper,#sucursales-accordion-wrapper *{box-sizing:border-box}
#sucursales-accordion-wrapper{width:100%;max-width:100%;margin:0;padding:0}
.accordion-header:hover{color:#666}
#sucursales-table-container a:hover{background:#0f5259!important}
@media(max-width:768px){
  #sucursales-table-container table{font-size:.9em}
  #sucursales-table-container th,#sucursales-table-container td{padding:10px 8px}
  #sucursales-table-container a{padding:6px 10px;font-size:13px}
}
</style>
