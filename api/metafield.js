<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Mundo IN — Inventario Multisede</title>

<style>
:root{
  --bg:#0f172a; --panel:#111827; --text:#e5e7eb;
  --primary:#22c55e; --danger:#ef4444; --border:#1f2937;
}
body{
  margin:0; font-family:system-ui;
  background:var(--bg); color:var(--text);
  display:flex; justify-content:center; padding:40px;
}
.card{
  width:100%; max-width:1100px;
  background:var(--panel); border:1px solid var(--border);
  border-radius:16px; padding:24px;
}
h2{margin-top:0;text-align:center}
input,select{
  background:#020617;color:white;
  border:1px solid #334155;border-radius:6px;
  padding:6px;
}
table{
  width:100%; border-collapse:collapse; margin-top:20px;
}
th,td{
  border:1px solid var(--border);
  padding:6px; text-align:center;
}
th{background:#020617}
button{
  padding:10px 16px;border:none;border-radius:8px;
  font-weight:bold; cursor:pointer;
}
.green{background:var(--primary);color:#000}
.red{background:var(--danger);color:white}
#log{
  margin-top:20px; background:black;
  padding:12px; border-radius:8px;
  font-family:monospace; font-size:13px;
  max-height:250px; overflow:auto;
}
</style>
</head>

<body>
<div class="card">

<h2>Inventario Multisede — Mundo IN</h2>

<div style="display:flex;gap:10px;justify-content:center">
  <input id="handle" placeholder="handle del producto (ej. cama-luton)" style="width:280px">
  <button class="green" onclick="addRow()">+ Variante</button>
  <button class="green" onclick="sync()">Sincronizar</button>
</div>

<table id="tabla">
<thead>
<tr>
  <th>Tamaño</th>
  <th>Color</th>
  <th>SKU</th>
  <th>Centro</th>
  <th>Coyoacán</th>
  <th>Benito Juárez</th>
  <th>Gustavo Baz</th>
  <th>Naucalpan</th>
  <th>Toluca</th>
  <th>Querétaro</th>
  <th>Vallejo</th>
  <th>Puebla</th>
  <th></th>
</tr>
</thead>
<tbody></tbody>
</table>

<div id="log">Listo.</div>

</div>

<script>
const sucursales = [
 "Centro","Coyoacán","Benito Juárez","Gustavo Baz",
 "Naucalpan","Toluca","Querétaro","Vallejo","Puebla"
];

function log(msg,color=""){
  const div=document.createElement("div");
  div.textContent=`[${new Date().toLocaleTimeString()}] ${msg}`;
  if(color)div.style.color=color;
  document.getElementById("log").prepend(div);
}

function addRow(data={}){
  const tr=document.createElement("tr");

  tr.innerHTML=`
    <td><input value="${data.size||""}"></td>
    <td><input value="${data.color||""}"></td>
    <td><input value="${data.sku||""}"></td>
    ${sucursales.map(s=>`<td><input type="number" min="0" value="${data[s]||0}" style="width:70px"></td>`).join("")}
    <td><button class="red" onclick="this.closest('tr').remove()">X</button></td>
  `;
  document.querySelector("#tabla tbody").appendChild(tr);
}

async function sync(){
  const handle=document.getElementById("handle").value.trim();
  if(!handle)return alert("Pon el handle del producto");

  const rows=[...document.querySelectorAll("#tabla tbody tr")];
  if(!rows.length)return alert("Agrega al menos una variante");

  const variantes=rows.map(r=>{
    const inputs=[...r.querySelectorAll("input")];
    const obj={
      size:inputs[0].value,
      color:inputs[1].value,
      sku:inputs[2].value,
      sucursales:{}
    };
    sucursales.forEach((s,i)=>{
      obj.sucursales[s]=parseInt(inputs[3+i].value||0);
    });
    return obj;
  });

  log(`Enviando ${variantes.length} variantes…`,"#3b82f6");

  const res=await fetch("/api/sync_metafield",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({handle,variantes})
  });

  const data=await res.json();
  if(data.ok){
    log("✓ Sincronizado correctamente","#22c55e");
  }else{
    log("✗ Error: "+data.error,"#ef4444");
  }
}

// fila inicial
addRow();
</script>
</body>
</html>
