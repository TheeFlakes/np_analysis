import { writable, derived } from 'svelte/store';
import pb from '../pocketbase.js';

// Storage keys
const STORAGE_KEYS = {
	ORDERS: 'np_orders',
	ORDER_ITEMS: 'np_order_items',
	CUSTOMERS: 'np_customers',
	PRODUCTS: 'np_products',
	LAST_SYNC: 'np_last_sync'
};

// Writable stores for each collection
export const orders = writable([]);
export const orderItems = writable([]);
export const customers = writable([]);
export const products = writable([]);
export const isLoading = writable(false);
export const lastSync = writable(null);

// Derived stores for common data combinations
export const ordersWithCustomers = derived(
	[orders, customers],
	([$orders, $customers]) => {
		return $orders.map(order => ({
			...order,
			expand: {
				...order.expand,
				customer: $customers.find(c => c.id === order.customer) || null
			}
		}));
	}
);

export const orderItemsWithProducts = derived(
	[orderItems, products],
	([$orderItems, $products]) => {
		return $orderItems.map(item => ({
			...item,
			expand: {
				...item.expand,
				product: $products.find(p => p.id === item.product) || null
			}
		}));
	}
);

// Load data from localStorage
function loadFromStorage(key) {
	try {
		const stored = localStorage.getItem(key);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error(`Error loading ${key} from storage:`, error);
	}
	return null;
}

// Save data to localStorage
function saveToStorage(key, data) {
	try {
		localStorage.setItem(key, JSON.stringify(data));
	} catch (error) {
		console.error(`Error saving ${key} to storage:`, error);
	}
}

// Initialize stores from localStorage
function initializeFromStorage() {
	const storedOrders = loadFromStorage(STORAGE_KEYS.ORDERS);
	const storedOrderItems = loadFromStorage(STORAGE_KEYS.ORDER_ITEMS);
	const storedCustomers = loadFromStorage(STORAGE_KEYS.CUSTOMERS);
	const storedProducts = loadFromStorage(STORAGE_KEYS.PRODUCTS);
	const storedLastSync = loadFromStorage(STORAGE_KEYS.LAST_SYNC);

	if (storedOrders) orders.set(storedOrders);
	if (storedOrderItems) orderItems.set(storedOrderItems);
	if (storedCustomers) customers.set(storedCustomers);
	if (storedProducts) products.set(storedProducts);
	if (storedLastSync) lastSync.set(new Date(storedLastSync));

	return {
		hasCachedData: !!(storedOrders || storedOrderItems || storedCustomers || storedProducts)
	};
}

// Fetch all data from PocketBase
async function fetchAllData() {
	try {
		isLoading.set(true);

		// Fetch all collections in parallel
		const [ordersData, orderItemsData, customersData, productsData] = await Promise.all([
			pb.collection('orders').getList(1, 500, {
				expand: 'customer',
				sort: '-created'
			}),
			pb.collection('order_items').getList(1, 500, {
				expand: 'product'
			}),
			pb.collection('customers').getList(1, 500, {
				sort: '-created'
			}),
			pb.collection('products').getList(1, 500)
		]);

		// Update stores
		orders.set(ordersData.items);
		orderItems.set(orderItemsData.items);
		customers.set(customersData.items);
		products.set(productsData.items);

		// Save to localStorage
		saveToStorage(STORAGE_KEYS.ORDERS, ordersData.items);
		saveToStorage(STORAGE_KEYS.ORDER_ITEMS, orderItemsData.items);
		saveToStorage(STORAGE_KEYS.CUSTOMERS, customersData.items);
		saveToStorage(STORAGE_KEYS.PRODUCTS, productsData.items);
		saveToStorage(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

		lastSync.set(new Date());

		return true;
	} catch (error) {
		console.error('Error fetching data:', error);
		return false;
	} finally {
		isLoading.set(false);
	}
}

// Set up real-time subscriptions
let subscriptions = [];

function setupSubscriptions() {
	// Clean up existing subscriptions
	cleanupSubscriptions();

	// Subscribe to orders
	const ordersSub = pb.collection('orders').subscribe('*', async (e) => {
		console.log('Orders event:', e.action);
		
		const currentOrders = loadFromStorage(STORAGE_KEYS.ORDERS) || [];
		
		if (e.action === 'create') {
			// Fetch the new order with expand
			try {
				const newOrder = await pb.collection('orders').getOne(e.record.id, {
					expand: 'customer'
				});
				currentOrders.unshift(newOrder);
				orders.set(currentOrders);
				saveToStorage(STORAGE_KEYS.ORDERS, currentOrders);
			} catch (error) {
				console.error('Error fetching new order:', error);
			}
		} else if (e.action === 'update') {
			// Fetch updated order with expand
			try {
				const updatedOrder = await pb.collection('orders').getOne(e.record.id, {
					expand: 'customer'
				});
				const index = currentOrders.findIndex(o => o.id === e.record.id);
				if (index !== -1) {
					currentOrders[index] = updatedOrder;
				} else {
					currentOrders.unshift(updatedOrder);
				}
				orders.set(currentOrders);
				saveToStorage(STORAGE_KEYS.ORDERS, currentOrders);
			} catch (error) {
				console.error('Error fetching updated order:', error);
			}
		} else if (e.action === 'delete') {
			const filtered = currentOrders.filter(o => o.id !== e.record.id);
			orders.set(filtered);
			saveToStorage(STORAGE_KEYS.ORDERS, filtered);
		}
	});

	// Subscribe to order_items
	const orderItemsSub = pb.collection('order_items').subscribe('*', async (e) => {
		console.log('Order items event:', e.action);
		
		const currentOrderItems = loadFromStorage(STORAGE_KEYS.ORDER_ITEMS) || [];
		
		if (e.action === 'create') {
			try {
				const newItem = await pb.collection('order_items').getOne(e.record.id, {
					expand: 'product'
				});
				currentOrderItems.unshift(newItem);
				orderItems.set(currentOrderItems);
				saveToStorage(STORAGE_KEYS.ORDER_ITEMS, currentOrderItems);
			} catch (error) {
				console.error('Error fetching new order item:', error);
			}
		} else if (e.action === 'update') {
			try {
				const updatedItem = await pb.collection('order_items').getOne(e.record.id, {
					expand: 'product'
				});
				const index = currentOrderItems.findIndex(oi => oi.id === e.record.id);
				if (index !== -1) {
					currentOrderItems[index] = updatedItem;
				} else {
					currentOrderItems.unshift(updatedItem);
				}
				orderItems.set(currentOrderItems);
				saveToStorage(STORAGE_KEYS.ORDER_ITEMS, currentOrderItems);
			} catch (error) {
				console.error('Error fetching updated order item:', error);
			}
		} else if (e.action === 'delete') {
			const filtered = currentOrderItems.filter(oi => oi.id !== e.record.id);
			orderItems.set(filtered);
			saveToStorage(STORAGE_KEYS.ORDER_ITEMS, filtered);
		}
	});

	// Subscribe to customers
	const customersSub = pb.collection('customers').subscribe('*', (e) => {
		console.log('Customers event:', e.action);
		
		const currentCustomers = loadFromStorage(STORAGE_KEYS.CUSTOMERS) || [];
		
		if (e.action === 'create') {
			currentCustomers.unshift(e.record);
			customers.set(currentCustomers);
			saveToStorage(STORAGE_KEYS.CUSTOMERS, currentCustomers);
		} else if (e.action === 'update') {
			const index = currentCustomers.findIndex(c => c.id === e.record.id);
			if (index !== -1) {
				currentCustomers[index] = e.record;
			} else {
				currentCustomers.unshift(e.record);
			}
			customers.set(currentCustomers);
			saveToStorage(STORAGE_KEYS.CUSTOMERS, currentCustomers);
		} else if (e.action === 'delete') {
			const filtered = currentCustomers.filter(c => c.id !== e.record.id);
			customers.set(filtered);
			saveToStorage(STORAGE_KEYS.CUSTOMERS, filtered);
		}
	});

	// Subscribe to products
	const productsSub = pb.collection('products').subscribe('*', (e) => {
		console.log('Products event:', e.action);
		
		const currentProducts = loadFromStorage(STORAGE_KEYS.PRODUCTS) || [];
		
		if (e.action === 'create') {
			currentProducts.unshift(e.record);
			products.set(currentProducts);
			saveToStorage(STORAGE_KEYS.PRODUCTS, currentProducts);
		} else if (e.action === 'update') {
			const index = currentProducts.findIndex(p => p.id === e.record.id);
			if (index !== -1) {
				currentProducts[index] = e.record;
			} else {
				currentProducts.unshift(e.record);
			}
			products.set(currentProducts);
			saveToStorage(STORAGE_KEYS.PRODUCTS, currentProducts);
		} else if (e.action === 'delete') {
			const filtered = currentProducts.filter(p => p.id !== e.record.id);
			products.set(filtered);
			saveToStorage(STORAGE_KEYS.PRODUCTS, filtered);
		}
	});

	subscriptions = [ordersSub, orderItemsSub, customersSub, productsSub];
}

function cleanupSubscriptions() {
	subscriptions.forEach(sub => {
		try {
			if (sub && typeof sub.unsubscribe === 'function') {
				sub.unsubscribe();
			}
		} catch (error) {
			console.error('Error unsubscribing:', error);
		}
	});
	subscriptions = [];
}

// Initialize the data store
export async function initializeDataStore() {
	// First, load from localStorage for instant display
	const { hasCachedData } = initializeFromStorage();

	// Then fetch fresh data from PocketBase in the background
	// This ensures we have the latest data while showing cached data immediately
	fetchAllData().then(() => {
		// Set up real-time subscriptions after initial fetch
		setupSubscriptions();
	});

	return { hasCachedData };
}

// Refresh data manually
export async function refreshData() {
	return await fetchAllData();
}

// Cleanup function
export function cleanupDataStore() {
	cleanupSubscriptions();
}

// Helper function to get order items for a specific order
export function getOrderItemsForOrder(orderId) {
	let items = [];
	orderItems.subscribe(value => {
		items = value.filter(oi => oi.order === orderId);
	})();
	return items;
}

