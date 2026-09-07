import { backend, store, type Ingredient, type Product } from '$lib/store.svelte';

const demoId = (name: string) => `demo-${name}`;

const ingredients: Ingredient[] = [
	{ id: demoId('kopi'), name: 'Biji kopi house blend', unit: 'gram', stock: 2400, minStock: 500, costPerUnit: 150 },
	{ id: demoId('susu'), name: 'Susu segar', unit: 'ml', stock: 8000, minStock: 2000, costPerUnit: 4 },
	{ id: demoId('aren'), name: 'Sirup aren', unit: 'ml', stock: 1500, minStock: 400, costPerUnit: 6 },
	{ id: demoId('cup'), name: 'Set cup (gelas + tutup)', unit: 'pcs', stock: 120, minStock: 50, costPerUnit: 900 },
	{ id: demoId('matcha'), name: 'Matcha powder', unit: 'gram', stock: 400, minStock: 100, costPerUnit: 1200 },
	{ id: demoId('cokelat'), name: 'Cokelat bubuk', unit: 'gram', stock: 600, minStock: 150, costPerUnit: 450 },
	{ id: demoId('teh'), name: 'Teh bubuk', unit: 'gram', stock: 500, minStock: 100, costPerUnit: 350 },
	{ id: demoId('croffle'), name: 'Tepung croffle', unit: 'pcs', stock: 40, minStock: 12, costPerUnit: 3500 }
];

const variant = (id: string, name: string, price: number, recipe: { ingredientId: string; qty: number }[]) => ({
	id,
	name,
	price,
	recipe
});

const products: Product[] = [
	{
		id: demoId('es-kopi'),
		name: 'Es Kopi Susu',
		category: 'Kopi',
		art: 'art-coffee-milk',
		isActive: true,
		variants: [
			variant('demo-v-es-kopi-r', 'Reguler', 22000, [
				{ ingredientId: demoId('kopi'), qty: 15 },
				{ ingredientId: demoId('susu'), qty: 150 },
				{ ingredientId: demoId('aren'), qty: 20 },
				{ ingredientId: demoId('cup'), qty: 1 }
			]),
			variant('demo-v-es-kopi-b', 'Besar', 26000, [
				{ ingredientId: demoId('kopi'), qty: 20 },
				{ ingredientId: demoId('susu'), qty: 200 },
				{ ingredientId: demoId('aren'), qty: 25 },
				{ ingredientId: demoId('cup'), qty: 1 }
			])
		]
	},
	{
		id: demoId('americano'),
		name: 'Americano',
		category: 'Kopi',
		art: 'art-americano',
		isActive: true,
		variants: [
			variant('demo-v-americano', 'Reguler', 18000, [
				{ ingredientId: demoId('kopi'), qty: 14 },
				{ ingredientId: demoId('cup'), qty: 1 }
			])
		]
	},
	{
		id: demoId('matcha'),
		name: 'Matcha Latte',
		category: 'Non-kopi',
		art: 'art-matcha',
		isActive: true,
		variants: [
			variant('demo-v-matcha', 'Reguler', 25000, [
				{ ingredientId: demoId('matcha'), qty: 4 },
				{ ingredientId: demoId('susu'), qty: 200 },
				{ ingredientId: demoId('cup'), qty: 1 }
			])
		]
	},
	{
		id: demoId('cokelat'),
		name: 'Cokelat Panas',
		category: 'Non-kopi',
		art: 'art-chocolate',
		isActive: true,
		variants: [
			variant('demo-v-cokelat', 'Reguler', 25000, [
				{ ingredientId: demoId('cokelat'), qty: 30 },
				{ ingredientId: demoId('susu'), qty: 200 },
				{ ingredientId: demoId('cup'), qty: 1 }
			])
		]
	},
	{
		id: demoId('teh'),
		name: 'Teh Tarik',
		category: 'Non-kopi',
		art: 'art-caramel',
		isActive: true,
		variants: [
			variant('demo-v-teh', 'Reguler', 20000, [
				{ ingredientId: demoId('teh'), qty: 8 },
				{ ingredientId: demoId('susu'), qty: 150 },
				{ ingredientId: demoId('cup'), qty: 1 }
			])
		]
	},
	{
		id: demoId('croffle'),
		name: 'Croffle Cokelat',
		category: 'Makanan',
		art: 'art-croffle',
		isActive: true,
		variants: [
			variant('demo-v-croffle', '1 porsi', 18000, [
				{ ingredientId: demoId('croffle'), qty: 1 },
				{ ingredientId: demoId('cokelat'), qty: 10 }
			])
		]
	}
];

export function clearDemoStore() {
	store.ingredients = [];
	store.products = [];
	store.movements = [];
	store.transactions = [];
	store.purchases = [];
	store.opnames = [];
	store.expenses = [];
	store.profiles = [];
	store.plan = '';
	store.shop = { name: '', address: '', currency: 'IDR', phone: '' };
	store.shift = { id: '', openingCash: 0, openedAt: '', status: 'closed' };
	backend.enabled = false;
	backend.shopId = '';
	backend.role = '';
	backend.shopName = '';
	backend.subscription = null;
}

export function seedDemoStore() {
	clearDemoStore();
	store.ingredients = ingredients.map((ingredient) => ({ ...ingredient }));
	store.products = products.map((product) => ({
		...product,
		variants: product.variants.map((item) => ({ ...item, recipe: item.recipe.map((entry) => ({ ...entry })) }))
	}));
	store.shop = { name: 'Kopi Senja (demo)', address: 'Data contoh lokal', currency: 'IDR', phone: '' };
	store.profiles = [{ id: demoId('kasir'), name: 'Kasir Demo', email: 'kasir@demo.local', role: 'kasir' }];
	store.plan = 'demo';
	backend.enabled = false;
	backend.role = 'pemilik';
	backend.shopName = store.shop.name;
}
