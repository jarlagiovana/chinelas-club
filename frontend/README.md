
# Chinelas Club

Projeto desenvolvido para a atividade de Backend.

## Sobre o projeto

O Chinelas Club é um site de catálogo de chinelas temáticas inspiradas em filmes, séries, desenhos e futebol.

O sistema possui:
- Catálogo de produtos
- Cadastro de clientes
- Login de usuários
- Gerenciamento de contas
- Lista de favoritos
- Integração com banco de dados Cloudflare D1

## Tecnologias utilizadas

- HTML
- CSS
- JavaScript
- Hono
- Cloudflare Workers
- Cloudflare D1
- Fake Store API

## Endpoints da API

### Produtos
GET /products - Listar produtos

GET /products/:id - Buscar produto pelo ID

GET /categories - Listar categorias

### Clientes
POST /clients - Cadastrar cliente

GET /clients - Listar clientes

GET /clients/:id - Consultar cliente

PUT /clients/:id - Atualizar cliente

DELETE /clients/:id - Excluir cliente

### Favoritos
POST /clients/:id/favorites - Adicionar favorito

GET /clients/:id/favorites - Listar favoritos

DELETE /clients/:id/favorites/:productId - Remover favorito

## Banco de dados

O projeto utiliza Cloudflare D1 para armazenar clientes e favoritos.

## Execução local

Entre na pasta backend e execute:

npm install
npx wrangler dev

## Publicação

API hospedada no Cloudflare Workers.

Repositório público disponível no GitHub.
