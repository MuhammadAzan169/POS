// ---------------------------------------------------------------
//  Checkout logic for the New Sale screen.
//  A USB barcode scanner behaves like a keyboard: it "types" the
//  code and presses Enter. So we just listen for Enter on #scan.
// ---------------------------------------------------------------

const cart = [];                       // [{barcode,name,price,qty,discount}]
const scan = document.getElementById("scan");
const scanMsg = document.getElementById("scan-msg");
const tbody = document.querySelector("#cart tbody");
const grandCell = document.getElementById("grand");
const result = document.getElementById("result");

function money(n) { return Math.round(n).toLocaleString(); }

function render() {
  tbody.innerHTML = "";
  let grand = 0;
  cart.forEach((it, i) => {
    const net = it.price * it.qty - it.discount;
    grand += net;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.barcode}</td>
      <td>${it.name}</td>
      <td><input type="number" step="any" value="${it.price}" data-i="${i}" data-f="price" style="width:80px"></td>
      <td><input type="number" value="${it.qty}" data-i="${i}" data-f="qty" style="width:60px"></td>
      <td><input type="number" step="any" value="${it.discount}" data-i="${i}" data-f="discount" style="width:80px"></td>
      <td>${money(net)}</td>
      <td><button class="link danger" data-del="${i}">remove</button></td>`;
    tbody.appendChild(tr);
  });
  grandCell.textContent = money(grand);
}

// Edit price/qty/discount inline
tbody.addEventListener("input", (e) => {
  const i = e.target.dataset.i, f = e.target.dataset.f;
  if (i === undefined) return;
  cart[i][f] = parseFloat(e.target.value) || 0;
  // recompute only the grand total + this row's net without losing focus
  let grand = 0;
  cart.forEach((it) => { grand += it.price * it.qty - it.discount; });
  grandCell.textContent = money(grand);
  const row = e.target.closest("tr");
  row.children[5].textContent = money(cart[i].price * cart[i].qty - cart[i].discount);
});

// Remove a line
tbody.addEventListener("click", (e) => {
  const d = e.target.dataset.del;
  if (d === undefined) return;
  cart.splice(d, 1);
  render();
});

function addToCart(p) {
  const existing = cart.find((c) => c.barcode === p.barcode);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ barcode: p.barcode, name: p.name, price: p.price, qty: 1, discount: 0 });
  }
  render();
}

async function lookup(code) {
  scanMsg.textContent = "…";
  try {
    const res = await fetch(`/api/product/${encodeURIComponent(code)}`);
    const p = await res.json();
    if (p.found) {
      addToCart(p);
      scanMsg.textContent = `Added: ${p.name}` + (p.stock <= 0 ? "  ⚠ out of stock" : "");
    } else {
      scanMsg.textContent = `❌ No product with code "${code}"`;
    }
  } catch (err) {
    scanMsg.textContent = "Network error — is the server running?";
  }
}

// Scanner / manual entry: Enter triggers a lookup
scan.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const code = scan.value.trim();
    scan.value = "";
    if (code) lookup(code);
  }
});

// F9 = complete sale (handy when using a scanner, no mouse needed)
document.addEventListener("keydown", (e) => {
  if (e.key === "F9") { e.preventDefault(); checkout(); }
});
document.getElementById("checkout").addEventListener("click", checkout);

async function checkout() {
  if (cart.length === 0) { result.textContent = "Cart is empty."; return; }
  const payload = {
    cashier: document.getElementById("cashier").value,
    customer_id: document.getElementById("customer").value,
    items: cart,
  };
  result.textContent = "Saving…";
  try {
    const res = await fetch("/api/sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      // jump straight to the printable receipt
      window.location.href = `/sales/${data.invoice}`;
    } else {
      result.textContent = "Error: " + (data.error || "could not save");
    }
  } catch (err) {
    result.textContent = "Network error — is the server running?";
  }
}

// keep focus on the scan box so scanning always works
scan.focus();
document.addEventListener("click", (e) => {
  if (!e.target.matches("input,select,button,a")) scan.focus();
});
