export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Método no permitido' });
  if (req.method !== 'POST') 
    return res.status(405).json({ ok:false, error:'Método no permitido' });

  try {
    const { handle, cambios } = req.body;
    if (!handle || !cambios) return res.status(400).json({ ok:false, error:'Datos incompletos' });
    if (!handle || !cambios) 
      return res.status(400).json({ ok:false, error:'Datos incompletos' });

    const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
@@ -31,14 +33,29 @@ export default async function handler(req, res) {

    const json = await productRes.json();
    const product = json?.data?.productByHandle;
    if(!product) return res.status(404).json({ ok:false, error:'Producto no encontrado' });
    if(!product) 
      return res.status(404).json({ ok:false, error:'Producto no encontrado' });

    let data = JSON.parse(product.metafield.value);
    // --- Parsear JSON o crear estructura base si falla ---
    let data;
    try {
      data = JSON.parse(product.metafield?.value || '{}');
    } catch {
      data = {};
    }

    // --- Asegurar que existan sucursales ---
    const defaultSucursales = [
      "Suc. Centro","Suc. Coyoacán","Suc. Benito Juárez","Suc. Gustavo Baz",
      "Suc. Naucalpan","Suc. Toluca","Suc. Querétaro","Suc. Vallejo","Suc. Puebla"
    ];
    data.sucursales = data.sucursales || defaultSucursales.map(n => ({ nombre: n, cantidad: 0 }));

    // --- Actualizar solo sucursales que cambian ---
    Object.entries(cambios).forEach(([sucursal, cantidad]) => {
      const idx = data.sucursales.findIndex(s => s.nombre === sucursal);
      if(idx !== -1) data.sucursales[idx].cantidad = Number(cantidad);
      else data.sucursales.push({ nombre: sucursal, cantidad: Number(cantidad) }); // forzar nuevos
    });

    // --- Guardar metafield ---
@@ -73,7 +90,7 @@ export default async function handler(req, res) {
    const errors = saveJson?.data?.metafieldsSet?.userErrors;
    if(errors?.length) return res.status(400).json({ ok:false, error: errors[0].message });

    // --- Devolver stock actualizado ---
    // --- Devolver stock actualizado forzado ---
    return res.json({ ok:true, sucursales: data.sucursales });

  } catch(err) {
