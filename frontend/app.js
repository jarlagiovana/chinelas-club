const API_URL = 'http://localhost:8787'

const THEMES = [
  'Sugestão Estampa: Filme',
  'Sugestão Estampa: Série',
  'Sugestão Estampa: Time de Futebol'
]

let products = []
let favorites = JSON.parse(localStorage.getItem('chinelas_favs') || '[]')
let account = JSON.parse(localStorage.getItem('chinelas_account') || 'null')

const $ = (sel) => document.querySelector(sel)

function notify(msg) {
  const el = $('#toast')
  el.textContent = msg
  el.classList.remove('hidden')
  clearTimeout(notify._t)
  notify._t = setTimeout(() => el.classList.add('hidden'), 3000)
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'))
  $(`#tab-${tabName}`).classList.add('active')
  $(`.nav-btn[data-tab="${tabName}"]`).classList.add('active')
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})
$('#go-produtos').addEventListener('click', () => switchTab('produtos'))
$('#go-conta').addEventListener('click', () => switchTab('conta'))

function syncAccountUI() {
  if (!account) {
    $('#session-badge').textContent = 'Modo local (sem D1)'
    $('#active-user').textContent = 'Nenhuma'
    $('#upd-name').value = ''
    $('#upd-email').value = ''
    return
  }
  $('#session-badge').textContent = account.name
  $('#active-user').textContent = `${account.name} (${account.email})`
  $('#upd-name').value = account.name
  $('#upd-email').value = account.email
}

function saveFavorites() {
  localStorage.setItem('chinelas_favs', JSON.stringify(favorites))
  $('#fav-count').textContent = String(favorites.length)
  renderFavorites()
  renderProducts()
}

async function loadCategories() {
  try {
    const res = await fetch(`${API_URL}/categories`)
    if (!res.ok) return
    const cats = await res.json()
    const sel = $('#category-filter')
    sel.innerHTML = '<option value="">Todas as categorias</option>'
    cats.forEach((cat) => {
      const opt = document.createElement('option')
      opt.value = cat
      opt.textContent = cat
      sel.appendChild(opt)
    })
  } catch {
    notify('Não foi possível carregar categorias da API.')
  }
}

async function loadProducts(category = '') {
  const grid = $('#products-grid')
  grid.innerHTML = '<p class="muted">Carregando produtos...</p>'
  try {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    const res = await fetch(`${API_URL}/products${qs}`)
    if (!res.ok) throw new Error()
    products = await res.json()
    renderProducts()
  } catch {
    grid.innerHTML = '<p class="muted">Verifique se o wrangler dev está rodando em localhost:8787.</p>'
  }
}

function renderProducts() {
  const grid = $('#products-grid')
  const favIds = new Set(favorites.map((p) => Number(p.id)))
  grid.innerHTML = ''

  products.forEach((p, idx) => {
    const isFav = favIds.has(Number(p.id))
    const theme = THEMES[idx % THEMES.length]
    const card = document.createElement('article')
    card.className = 'card'
    card.innerHTML = `
      <div>
        <img src="${p.image}" alt="${p.title}" />
        <span class="theme-tag">${theme} · ${p.category}</span>
        <h4>${p.title}</h4>
      </div>
      <div class="card-footer">
        <strong>$${Number(p.price).toFixed(2)}</strong>
        <div class="row-actions">
          <button class="btn-outline detail-btn" data-id="${p.id}">Detalhes</button>
          <button class="heart-btn ${isFav ? 'active' : ''}" data-id="${p.id}" title="Favoritar">♥</button>
        </div>
      </div>
    `
    card.querySelector('.detail-btn').addEventListener('click', () => openModal(p, theme))
    card.querySelector('.heart-btn').addEventListener('click', () => toggleFavorite(p))
    grid.appendChild(card)
  })
}

function openModal(product, theme) {
  $('#modal-img').src = product.image
  $('#modal-title').textContent = product.title
  $('#modal-theme').textContent = `${theme} (Produto real da Fake Store API)`
  $('#modal-desc').textContent = product.description
  $('#modal-price').textContent = `Preço original: $${Number(product.price).toFixed(2)}`
  $('#modal').classList.remove('hidden')
}

$('#close-modal').addEventListener('click', () => $('#modal').classList.add('hidden'))

function toggleFavorite(product) {
  const exists = favorites.some((item) => Number(item.id) === Number(product.id))
  if (exists) {
    favorites = favorites.filter((item) => Number(item.id) !== Number(product.id))
    notify('Removido dos favoritos.')
  } else {
    favorites.push(product)
    notify('Adicionado aos favoritos!')
  }
  saveFavorites()
}

function renderFavorites() {
  const grid = $('#favorites-grid')
  if (!favorites.length) {
    grid.innerHTML = '<p class="muted">Ainda não há produtos favoritos.</p>'
    return
  }
  grid.innerHTML = ''
  favorites.forEach((prod) => {
    const card = document.createElement('article')
    card.className = 'card'
    card.innerHTML = `
      <div>
        <img src="${prod.image}" alt="${prod.title}" />
        <h4>${prod.title}</h4>
      </div>
      <div class="card-footer">
        <strong>$${Number(prod.price).toFixed(2)}</strong>
        <button class="btn-danger">Remover</button>
      </div>
    `
    card.querySelector('.btn-danger').addEventListener('click', () => toggleFavorite(prod))
    grid.appendChild(card)
  })
}

$('#register-form').addEventListener('submit', (e) => {
  e.preventDefault()
  account = {
    name: $('#reg-name').value.trim(),
    email: $('#reg-email').value.trim()
  }
  localStorage.setItem('chinelas_account', JSON.stringify(account))
  e.target.reset()
  syncAccountUI()
  notify('Conta salva localmente (será ligada ao D1 no fim).')
})

$('#update-form').addEventListener('submit', (e) => {
  e.preventDefault()
  if (!account) return notify('Nenhuma conta ativa.')
  account = {
    name: $('#upd-name').value.trim() || account.name,
    email: $('#upd-email').value.trim() || account.email
  }
  localStorage.setItem('chinelas_account', JSON.stringify(account))
  syncAccountUI()
  notify('Dados da conta atualizados!')
})

$('#delete-account').addEventListener('click', () => {
  if (!account) return notify('Nenhuma conta ativa.')
  account = null
  localStorage.removeItem('chinelas_account')
  syncAccountUI()
  notify('Conta removida.')
})

$('#category-filter').addEventListener('change', (e) => loadProducts(e.target.value))

syncAccountUI()
$('#fav-count').textContent = String(favorites.length)
renderFavorites()
loadCategories()
loadProducts()