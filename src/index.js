
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
const FAKE_STORE = 'https://fakestoreapi.com'

app.use('*', cors())

const db = c => c.env.DB
const validId = value =>
  /^\d+$/.test(String(value)) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0

const hex = bytes =>
  Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

const fromHex = value =>
  new Uint8Array(value.match(/.{2}/g).map(x => parseInt(x, 16)))

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  ))
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2_sha256$210000$${hex(salt)}$${hex(await derive(password, salt, 210000))}`
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$')

  if (
    parts.length !== 4 ||
    parts[0] !== 'pbkdf2_sha256'
  ) return false

  const iterations = Number(parts[1])

  if (
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    iterations > 1000000 ||
    !/^[a-f0-9]{32}$/i.test(parts[2]) ||
    !/^[a-f0-9]{64}$/i.test(parts[3])
  ) return false

  const expected = fromHex(parts[3])
  const actual = await derive(password, fromHex(parts[2]), iterations)

  let difference = 0

  for (let i = 0; i < expected.length; i++) {
    difference |= expected[i] ^ actual[i]
  }

  return difference === 0
}

async function tokenHash(token) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  )
  return hex(new Uint8Array(bytes))
}

async function createSession(c, clientId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const expires = new Date(Date.now() + 7 * 86400000).toISOString()

  await db(c).prepare(
    'INSERT INTO sessions (token_hash, client_id, expires_at) VALUES (?, ?, ?)'
  ).bind(await tokenHash(token), clientId, expires).run()

  return token
}

async function authenticated(c, next) {
  const authorization = c.req.header('Authorization') || ''
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : ''

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return c.json({ error: 'Faça login para continuar.' }, 401)
  }

  const hashed = await tokenHash(token)

  const session = await db(c).prepare(`
    SELECT s.client_id, c.name, c.email, c.created_at
    FROM sessions s
    JOIN clients c ON c.id = s.client_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(hashed, new Date().toISOString()).first()

  if (!session) {
    return c.json({ error: 'Sessão expirada. Entre novamente.' }, 401)
  }

  c.set('client', session)
  c.set('tokenHash', hashed)

  await next()
}

// INÍCIO DA API

app.get('/', c => c.json({
  status: 'API Chinelas Club funcionando',
  database: c.env.DB ? 'D1 configurado' : 'D1 indisponível'
}))

// PRODUTOS

app.get('/products', async c => {
  try {
    const category = c.req.query('category')
    const url = category
      ? `${FAKE_STORE}/products/category/${encodeURIComponent(category)}`
      : `${FAKE_STORE}/products`

    const response = await fetch(url)

    if (!response.ok) {
      return c.json({ error: 'Erro ao buscar produtos.' }, 502)
    }

    return c.json(await response.json())
  } catch {
    return c.json({ error: 'API externa indisponível.' }, 502)
  }
})

app.get('/products/:id', async c => {
  const id = c.req.param('id')

  if (!validId(id)) {
    return c.json({ error: 'ID inválido.' }, 400)
  }

  try {
    const response = await fetch(`${FAKE_STORE}/products/${id}`)

    if (!response.ok) {
      return c.json(
        { error: 'Produto não encontrado.' },
        response.status === 404 ? 404 : 502
      )
    }

    return c.json(await response.json())
  } catch {
    return c.json({ error: 'Erro ao consultar produto.' }, 502)
  }
})


app.get('/categories', (c) => {
  return c.json([
    'Filmes',
    'Séries',
    'Desenhos',
    'Futebol'
  ])
})

// CADASTRO

app.post('/clients', async c => {
  try {
    const { name, email, password } = await c.req.json()

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 6
    ) {
      return c.json({
        error: 'Informe nome, e-mail válido e senha de pelo menos 6 caracteres.'
      }, 400)
    }

    const normalized = email.trim().toLowerCase()

    const result = await db(c).prepare(
      'INSERT INTO clients (name, email, password_hash) VALUES (?, ?, ?)'
    ).bind(
      name.trim(),
      normalized,
      await hashPassword(password)
    ).run()

    const id = result.meta.last_row_id
    const token = await createSession(c, id)

    return c.json({
      id,
      name: name.trim(),
      email: normalized,
      token,
      message: 'Cliente cadastrado com sucesso!'
    }, 201)
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return c.json({
        error: 'E-mail já cadastrado. Use Entrar na minha conta.'
      }, 409)
    }

    return c.json({ error: 'Erro ao cadastrar cliente.' }, 500)
  }
})

// LOGIN

app.post('/login', async c => {
  try {
    const { email, password } = await c.req.json()

    if (
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return c.json({ error: 'E-mail ou senha inválidos.' }, 400)
    }

    const client = await db(c).prepare(`
      SELECT id, name, email, password_hash, created_at
      FROM clients
      WHERE email = ?
    `).bind(email.trim().toLowerCase()).first()

    if (
      !client ||
      !(await verifyPassword(password, client.password_hash))
    ) {
      return c.json({ error: 'E-mail ou senha incorretos.' }, 401)
    }

    const token = await createSession(c, client.id)

    return c.json({
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        created_at: client.created_at
      }
    })
  } catch {
    return c.json({ error: 'Erro ao entrar na conta.' }, 500)
  }
})

// PROTEÇÃO DAS ROTAS

app.use('/me', authenticated)
app.use('/logout', authenticated)
app.use('/clients/*', authenticated)
app.get('/clients', authenticated)

// CONTA CONECTADA

app.get('/me', c => c.json(c.get('client')))

app.post('/logout', async c => {
  await db(c).prepare(
    'DELETE FROM sessions WHERE token_hash = ?'
  ).bind(c.get('tokenHash')).run()

  return c.json({ message: 'Sessão encerrada.' })
})

// CONSULTAR CLIENTE

app.get('/clients', async c => {
  return c.json([c.get('client')])
})

app.get('/clients/:id', async c => {
  const id = c.req.param('id')

  if (!validId(id)) {
    return c.json({ error: 'ID inválido.' }, 400)
  }

  if (Number(id) !== c.get('client').client_id) {
    return c.json({ error: 'Acesso negado.' }, 403)
  }

  return c.json(c.get('client'))
})

// ATUALIZAR CLIENTE

app.put('/clients/:id', async c => {
  const id = c.req.param('id')

  if (!validId(id)) {
    return c.json({ error: 'ID inválido.' }, 400)
  }

  if (Number(id) !== c.get('client').client_id) {
    return c.json({ error: 'Acesso negado.' }, 403)
  }

  try {
    const body = await c.req.json()

    const name = body.name === undefined
      ? c.get('client').name
      : typeof body.name === 'string' ? body.name.trim() : ''

    const email = body.email === undefined
      ? c.get('client').email
      : typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : ''

    if (
      !name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return c.json({
        error: 'Nome e e-mail válido são obrigatórios.'
      }, 400)
    }

    if (body.password !== undefined) {
      if (
        typeof body.password !== 'string' ||
        body.password.length < 6
      ) {
        return c.json({
          error: 'Senha deve ter 6 caracteres ou mais.'
        }, 400)
      }

      await db(c).prepare(`
        UPDATE clients
        SET name = ?, email = ?, password_hash = ?
        WHERE id = ?
      `).bind(
        name,
        email,
        await hashPassword(body.password),
        id
      ).run()
    } else {
      await db(c).prepare(
        'UPDATE clients SET name = ?, email = ? WHERE id = ?'
      ).bind(name, email, id).run()
    }

    return c.json({
      id: Number(id),
      name,
      email,
      message: 'Cliente atualizado!'
    })
  
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return c.json({
        error: 'E-mail já cadastrado. Use Entrar na minha conta.'
      }, 409)
    }

    console.error('Erro no cadastro:', error)

    return c.json({
      error: 'Erro ao cadastrar cliente.'
    }, 500)
  }
})


// EXCLUIR CLIENTE

app.delete('/clients/:id', async c => {
  const id = c.req.param('id')

  if (!validId(id)) {
    return c.json({ error: 'ID inválido.' }, 400)
  }

  if (Number(id) !== c.get('client').client_id) {
    return c.json({ error: 'Acesso negado.' }, 403)
  }

  await db(c).batch([
    db(c).prepare(
      'DELETE FROM sessions WHERE client_id = ?'
    ).bind(id),

    db(c).prepare(
      'DELETE FROM favorites WHERE client_id = ?'
    ).bind(id),

    db(c).prepare(
      'DELETE FROM clients WHERE id = ?'
    ).bind(id)
  ])

  return c.json({ message: 'Cliente excluído com sucesso!' })
})

// ADICIONAR FAVORITOS

app.post('/clients/:id/favorites', async c => {
  const id = c.req.param('id')

  if (!validId(id)) {
    return c.json({ error: 'Cliente inválido.' }, 400)
  }

  if (Number(id) !== c.get('client').client_id) {
    return c.json({ error: 'Acesso negado.' }, 403)
  }

  let body

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400)
  }

  if (!validId(body.product_id)) {
    return c.json({ error: 'Produto inválido.' }, 400)
  }

  const result = await db(c).prepare(`
    INSERT OR IGNORE INTO favorites (client_id, product_id)
    VALUES (?, ?)
  `).bind(id, body.product_id).run()

  
  return c.json({
    message: result.meta.changes
      ? 'Favorito adicionado!'
      : 'Produto já está nos favoritos.',
    client_id: Number(id),
    product_id: Number(body.product_id)
  }, result.meta.changes ? 201 : 200)
})

// CONSULTAR FAVORITOS

app.get('/clients/:id/favorites', async c => {
  const id = c.req.param('id')

  if (!validId(id)) {
    return c.json({ error: 'ID inválido.' }, 400)
  }

  if (Number(id) !== c.get('client').client_id) {
    return c.json({ error: 'Acesso negado.' }, 403)
  }

  const result = await db(c).prepare(`
    SELECT id, client_id, product_id, created_at
    FROM favorites
    WHERE client_id = ?
  `).bind(id).all()

  return c.json(result.results)
})

// REMOVER FAVORITOS

app.delete('/clients/:id/favorites/:productId', async c => {
  const id = c.req.param('id')
  const productId = c.req.param('productId')

  if (!validId(id) || !validId(productId)) {
    return c.json({ error: 'ID inválido.' }, 400)
  }

  if (Number(id) !== c.get('client').client_id) {
    return c.json({ error: 'Acesso negado.' }, 403)
  }

  const result = await db(c).prepare(`
    DELETE FROM favorites
    WHERE client_id = ? AND product_id = ?
  `).bind(id, productId).run()

  if (!result.meta.changes) {
    return c.json({ error: 'Favorito não encontrado.' }, 404)
  }

  return c.json({ message: 'Favorito removido com sucesso!' })
})

export default app
