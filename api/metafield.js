export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { handle, variantes } = req.body;

  if (!handle || !variantes) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const SHOP = "mundoin.mx";
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const API_VERSION = "2026-01";

  try {
    /* ======================================================
       1. OBTENER PRODUCTO POR HANDLE
    ====================================================== */
    const productRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/products.json?handle=${handle}`,
      {
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const productData = await productRes.json();
    if (!productData.products.length) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const product = productData.products[0];

    /* ======================================================
       2. MAPEAR VARIANTES EXISTENTES POR SKU
    ====================================================== */
    const variantMap = {};
    product.variants.forEach(v => {
      variantMap[v.sku] = v.id;
    });

    /* ======================================================
       3. CREAR / ACTUALIZAR METAFIELDS
    ====================================================== */
    for (const v of variantes) {
      const variantId = variantMap[v.sku];
      if (!variantId) continue;

      await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/metafields.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metafield: {
              namespace: "custom",
              key: "inventario_sucursales",
              type: "json",
              owner_id: variantId,
              owner_resource: "variant",
              value: JSON.stringify(v.sucursales),
            },
          }),
        }
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
}
