// =================== CONFIGURAÇÃO OAuth 2.0 ===================
const CLIENT_ID = '624067080991-tkdvandvm220tohqnd4c0bshhvbjhamh.apps.googleusercontent.com';
const SPREADSHEET_ID = '1tdkCbWRyw8JyJIIkyTaJ0BA5x9ofIu6dpg4QPVw1hGc'; // Se você criou uma planilha nova, use o ID dela aqui.
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Variáveis Globais de Autenticação e Dados
let tokenClient;
let accessToken = null;
let products = [];
let orders = [];

// =================== LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO ===================

// Funções chamadas pelos scripts do Google no HTML
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    });
    // Habilita o botão de login quando a biblioteca estiver pronta
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Login com Google';
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            accessToken = tokenResponse.access_token;
            toggleAuthUI(true);
            loadInitialData();
        },
    });
}

// Funções de clique dos botões de Login/Logout
function handleAuthClick() {
    if (accessToken === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    }
}

function handleSignoutClick() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            accessToken = null;
            toggleAuthUI(false);
            products = [];
            orders = [];
            renderProducts();
            renderOrders();
            alert("Você foi desconectado.");
        });
    }
}

// Controla a visibilidade dos elementos da UI baseados no estado de login
function toggleAuthUI(isLoggedIn) {
    document.getElementById('loginBtn').style.display = isLoggedIn ? 'none' : 'block';
    document.getElementById('logoutBtn').style.display = isLoggedIn ? 'block' : 'none';
    document.querySelector('.main-content').style.display = isLoggedIn ? 'block' : 'none';
}

// Carrega os dados da planilha após o login bem-sucedido
async function loadInitialData() {
    await loadProductsFromGoogleSheets();
    await loadOrdersFromGoogleSheets();
    renderProducts();
    renderOrders();
    updateStats();
    // Inicia o auto-refresh somente após o login
    setInterval(refreshOrders, 30000);
}

// Atualiza os pedidos periodicamente
async function refreshOrders() {
    if (!accessToken) return;
    await loadOrdersFromGoogleSheets();
    renderOrders();
    updateStats();
}

// Inicialização principal do aplicativo
document.addEventListener('DOMContentLoaded', function() {
    // Esconde o conteúdo principal até o login ser feito
    document.querySelector('.main-content').style.display = 'none';
    
    // Adiciona os event listeners aos formulários e botões
    document.getElementById('productForm').addEventListener('submit', addProduct);
    document.getElementById('searchProducts').addEventListener('input', filterProducts);
    document.getElementById('filterCategory').addEventListener('change', filterProducts);
    document.getElementById('statusFilter').addEventListener('change', filterOrders);
    document.getElementById('dateFilter').addEventListener('change', filterOrders);
});


// =================== LÓGICA DE GERENCIAMENTO DE PRODUTOS ===================

async function addProduct(event) {
    event.preventDefault();
    if (!accessToken) return alert("Faça o login primeiro.");
    
    const product = {
        id: Date.now(),
        name: document.getElementById('productName').value,
        category: document.getElementById('productCategory').value,
        price: parseFloat(document.getElementById('productPrice').value),
        status: document.getElementById('productStatus').value,
        description: document.getElementById('productDescription').value,
        createdAt: new Date().toISOString()
    };
    
    const productRow = [
        product.id, product.name, product.category, product.price,
        product.status, product.description, product.createdAt
    ];
    
    const success = await saveToGoogleSheets('Produtos', productRow);
    if (success) {
        products.push(product);
        renderProducts();
        document.getElementById('productForm').reset();
        showNotification('Produto adicionado com sucesso!', 'success');
    } else {
        showNotification('Erro ao salvar produto no Google Sheets.', 'error');
    }
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        document.getElementById('productName').value = product.name;
        document.getElementById('productCategory').value = product.category;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productStatus').value = product.status;
        document.getElementById('productDescription').value = product.description;
        
        products = products.filter(p => p.id !== id);
        renderProducts();
    }
}

async function deleteProduct(id) {
    if (confirm('Deseja realmente excluir este produto?')) {
        const success = await deleteFromGoogleSheets('Produtos', id);
        if (success) {
            products = products.filter(p => p.id !== id);
            renderProducts();
            showNotification('Produto excluído com sucesso!', 'success');
        } else {
            showNotification('Erro ao excluir produto do Google Sheets.', 'error');
        }
    }
}

async function toggleProductStatus(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        product.status = product.status === 'ativo' ? 'inativo' : 'ativo';
        const productRow = [
            product.id, product.name, product.category, product.price,
            product.status, product.description, product.createdAt
        ];

        const success = await updateInGoogleSheets('Produtos', product.id, productRow);
        if (success) {
            renderProducts();
            showNotification('Status do produto atualizado!', 'success');
        } else {
            product.status = product.status === 'ativo' ? 'inativo' : 'ativo'; // Reverte em caso de falha
            renderProducts();
            showNotification('Erro ao atualizar status no Google Sheets.', 'error');
        }
    }
}

// =================== LÓGICA DE GERENCIAMENTO DE PEDIDOS ===================

async function updateOrderStatus(orderId, newStatus) {
    const order = orders.find(o => o.id === orderId);
    if (order) {
        const originalStatus = order.status;
        order.status = newStatus;
        order.updatedAt = new Date().toISOString();

        const orderRow = [
            order.id, order.customer || '', JSON.stringify(order.items),
            order.total, order.status, order.createdAt, order.updatedAt
        ];
        
        const success = await updateInGoogleSheets('Pedidos', order.id, orderRow);
        if (success) {
            renderOrders();
            updateStats();
            showNotification('Status do pedido atualizado!', 'success');
        } else {
            order.status = originalStatus; // Reverte em caso de falha
            renderOrders();
            showNotification('Erro ao atualizar status no Google Sheets.', 'error');
        }
    }
}

// =================== FUNÇÕES DE API (COMUNICAÇÃO COM GOOGLE SHEETS) ===================

async function findRowById(sheetName, id) {
    if (!accessToken) return -1;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:A`,
        });
        const ids = response.result.values;
        if (ids) {
            for (let i = 0; i < ids.length; i++) {
                if (parseInt(ids[i][0]) === id) {
                    return i + 1;
                }
            }
        }
        return -1;
    } catch (err) {
        console.error("Erro ao procurar linha por ID:", err);
        return -1;
    }
}

async function saveToGoogleSheets(sheetName, dataRow) {
    if (!accessToken) { alert('Sessão expirada. Faça o login novamente.'); return false; }
    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: sheetName,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [dataRow] },
        });
        return true;
    } catch (err) { console.error('Erro da API ao salvar:', err); return false; }
}

async function updateInGoogleSheets(sheetName, id, dataRow) {
    if (!accessToken) { alert('Sessão expirada. Faça o login novamente.'); return false; }
    const rowIndex = await findRowById(sheetName, id);
    if (rowIndex === -1) {
        return saveToGoogleSheets(sheetName, dataRow);
    }
    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [dataRow] },
        });
        return true;
    } catch (err) { console.error('Erro da API ao atualizar:', err); return false; }
}

async function deleteFromGoogleSheets(sheetName, id) {
    if (!accessToken) { alert('Sessão expirada. Faça o login novamente.'); return false; }
    const rowIndex = await findRowById(sheetName, id);
    if (rowIndex === -1) { console.warn("Item não encontrado para exclusão."); return true; }
    try {
        const sheetId = await getSheetIdByName(sheetName);
        if (sheetId === null) throw new Error("ID da aba não encontrado.");
        
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: "ROWS",
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex
                        }
                    }
                }]
            }
        });
        return true;
    } catch (err) { console.error('Erro da API ao excluir:', err); return false; }
}

let sheetIdMap = {};
async function getSheetIdByName(sheetName) {
    if (sheetIdMap[sheetName]) return sheetIdMap[sheetName];
    if (!accessToken) return null;
    try {
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });
        const sheets = response.result.sheets;
        for (const sheet of sheets) {
            sheetIdMap[sheet.properties.title] = sheet.properties.sheetId;
        }
        return sheetIdMap[sheetName];
    } catch (err) {
        console.error("Erro ao buscar IDs das abas:", err);
        return null;
    }
}

async function loadProductsFromGoogleSheets() {
    if (!accessToken) return;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Produtos!A2:G',
        });
        products = (response.result.values || []).map(row => ({
            id: parseInt(row[0]), name: row[1] || '', category: row[2] || '',
            price: parseFloat(row[3]) || 0, status: row[4] || 'ativo',
            description: row[5] || '', createdAt: row[6] || ''
        })).filter(p => p && p.id);
    } catch (err) { console.error("Erro ao carregar produtos:", err.result.error.message); }
}

async function loadOrdersFromGoogleSheets() {
    if (!accessToken) return;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Pedidos!A2:G',
        });
        orders = (response.result.values || []).map(row => {
            try {
                return {
                    id: parseInt(row[0]), customer: row[1] || '',
                    items: JSON.parse(row[2] || '[]'), total: parseFloat(row[3]) || 0,
                    status: row[4] || 'pendente', createdAt: row[5] || '', updatedAt: row[6] || ''
                }
            } catch (e) { return null; }
        }).filter(o => o && o.id);
    } catch (err) { console.error("Erro ao carregar pedidos:", err.result.error.message); }
}

// =================== FUNÇÕES DE UI (RENDERIZAÇÃO, FILTROS, ETC.) ===================

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    document.querySelector(`.tab-button[onclick="showTab('${tabName}')"]`).classList.add('active');
}

function renderProducts() {
    const container = document.getElementById('productsTable');
    if (!container) return;
    products.sort((a,b) => b.id - a.id);
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 40px;">Nenhum produto cadastrado ainda.</p>';
        return;
    }
    container.innerHTML = products.map(product => `
        <div class="product-card">
            <div class="product-header">
                <div class="product-name">${product.name}</div>
                <div class="product-price">R$ ${product.price ? product.price.toFixed(2) : '0.00'}</div>
            </div>
            <div class="product-category">${getCategoryName(product.category)}</div>
            <div class="product-description">${product.description || 'Sem descrição'}</div>
            <div class="product-actions">
                <button onclick="editProduct(${product.id})" class="btn btn-secondary">Editar</button>
                <button onclick="toggleProductStatus(${product.id})" class="btn ${product.status === 'ativo' ? 'btn-danger' : 'btn-success'}">
                    ${product.status === 'ativo' ? 'Desativar' : 'Ativar'}
                </button>
                <button onclick="deleteProduct(${product.id})" class="btn btn-danger">Excluir</button>
            </div>
        </div>
    `).join('');
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;
    orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (orders.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 40px;">Nenhum pedido recebido ainda.</p>';
        return;
    }
    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <div class="order-id">Pedido #${order.id}</div>
                    <div class="order-time">${formatDate(order.createdAt)}</div>
                    <div class="order-customer">Cliente: ${order.customer || 'Não informado'}</div>
                </div>
                <div class="order-status status-${order.status}">${getStatusName(order.status)}</div>
            </div>
            <div class="order-items">
                ${order.items.map(item => `<div class="order-item"><span>${item.quantity}x ${item.name}</span><span>R$ ${(item.price * item.quantity).toFixed(2)}</span></div>`).join('')}
            </div>
            <div class="order-total">Total: R$ ${order.total ? order.total.toFixed(2) : '0.00'}</div>
            <div style="margin-top: 15px;">
                <button onclick="updateOrderStatus(${order.id}, 'preparando')" class="btn btn-secondary" ${['preparando', 'pronto', 'entregue'].includes(order.status) ? 'disabled' : ''}>Preparar</button>
                <button onclick="updateOrderStatus(${order.id}, 'pronto')" class="btn btn-primary" ${['pendente', 'pronto', 'entregue'].includes(order.status) ? 'disabled' : ''}>Pronto</button>
                <button onclick="updateOrderStatus(${order.id}, 'entregue')" class="btn btn-success" ${['pendente', 'preparando', 'entregue'].includes(order.status) ? 'disabled' : ''}>Entregar</button>
            </div>
        </div>
    `).join('');
}

function filterProducts() {
    const search = document.getElementById('searchProducts').value.toLowerCase();
    const categoryFilter = document.getElementById('filterCategory').value;
    const filtered = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(search) || (product.description && product.description.toLowerCase().includes(search));
        const matchesCategory = !categoryFilter || product.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });
    // Para evitar bugs, vamos renderizar uma cópia filtrada sem alterar o array original
    renderFilteredProducts(filtered);
}

function filterOrders() {
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    const filtered = orders.filter(order => {
        const matchesStatus = !statusFilter || order.status === statusFilter;
        const matchesDate = !dateFilter || (order.createdAt && order.createdAt.startsWith(dateFilter));
        return matchesStatus && matchesDate;
    });
    renderFilteredOrders(filtered);
}

// Funções de renderização separadas para os filtros
function renderFilteredProducts(filteredData) {
    const originalProducts = products;
    products = filteredData;
    renderProducts();
    products = originalProducts;
}

function renderFilteredOrders(filteredData) {
    const originalOrders = orders;
    orders = filteredData;
    renderOrders();
    orders = originalOrders;
}


function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(order => order.createdAt && order.createdAt.startsWith(today));
    const pendingOrders = orders.filter(order => order.status === 'pendente');
    const totalToday = todayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    
    document.getElementById('ordersToday').textContent = todayOrders.length;
    document.getElementById('ordersPending').textContent = pendingOrders.length;
    document.getElementById('totalToday').textContent = `R$ ${totalToday.toFixed(2)}`;
}

function getCategoryName(category) {
    const categories = { 'entradas': 'Entradas', 'pratos-principais': 'Pratos Principais', 'sobremesas': 'Sobremesas', 'bebidas': 'Bebidas' };
    return categories[category] || category;
}

function getStatusName(status) {
    const statuses = { 'pendente': 'Pendente', 'preparando': 'Preparando', 'pronto': 'Pronto', 'entregue': 'Entregue' };
    return statuses[status] || status;
}

function formatDate(dateString) {
    if (!dateString) return 'Data indisponível';
    const date = new Date(dateString);
    return isNaN(date) ? 'Data inválida' : date.toLocaleString('pt-BR');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = ` position: fixed; top: 20px; right: 20px; padding: 15px 20px; border-radius: 8px; color: white; font-weight: 600; z-index: 1000; animation: slideIn 0.3s ease-out; `;
    const colors = { success: '#27ae60', error: '#e74c3c', info: '#3498db' };
    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => { notification.remove(); }, 3000);
}

const style = document.createElement('style');
style.textContent = ` @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } `;
document.head.appendChild(style);