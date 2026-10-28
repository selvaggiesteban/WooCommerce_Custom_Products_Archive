# Decotay/Tay - Buy With Quantity

> **A high-performance WooCommerce plugin** that adds quantity selectors and "Buy / Add to Cart" buttons to product archives, with full support for **variable products** (attribute selectors, dynamic price/stock/image updates). Built to be **theme-agnostic** with dedicated **XStore + Elementor** optimizations.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/selvaggiesteban/WooCommerce_Custom_Products_Archive/releases)
[![WC Tested](https://img.shields.io/badge/WC%20tested-9.0+-green.svg)](https://woocommerce.com/)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-purple.svg)](https://php.net/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)

---

## 🎯 Overview

Transform your WooCommerce product catalog pages into a streamlined purchasing experience. Instead of forcing customers to visit individual product pages, this plugin injects **quantity inputs** and **dual-action buttons** directly into the product loop:

| Button | Action |
|--------|--------|
| **Buy** | Redirects to the product page (with pre-selected attributes for variations) |
| **Add to Cart** | Adds the selected variation + quantity via AJAX, stays on catalog |

### ✨ Key Features

- 🎨 **Theme-Agnostic Core** — Works with any WooCommerce theme via universal `[data-product_id]` detection
- 🏪 **XStore + Elementor Optimized** — Auto-detects XStore, hides native buttons, handles Elementor widgets
- 🔄 **Variable Product Support** — Stacked dropdown selectors for each attribute (color, size, etc.)
- ⚡ **Dynamic Updates** — Price, stock status, and featured image update instantly on attribute change
- 🚀 **High Performance** — Multi-level caching (Memory + localStorage + WP Transients), lazy loading, deduplicated requests
- 🔍 **MutationObserver** — Auto-detects products loaded via AJAX, pagination, or Elementor dynamic content
- 🔌 **Dual API Layer** — REST API (preferred) + AJAX legacy fallback for maximum compatibility
- 🛡️ **Secure** — Nonce verification on all endpoints, proper capability checks

---

## 📸 Screenshots

| Product Archive (Simple) | Product Archive (Variable) | Dynamic Updates |
|:---:|:---:|:---:|
| ![Simple](docs/screenshots/simple.png) | ![Variable](docs/screenshots/variable.png) | ![Dynamic](docs/screenshots/dynamic.png) |

---

## 📦 Installation

### Via WordPress Admin

1. Download the latest release as a `.zip`
2. Go to **Plugins → Add New → Upload Plugin**
3. Select the zip and click **Install Now**
4. Click **Activate Plugin**

### Via Composer (Bedrock/Trellis)

```bash
composer require selvaggiesteban/decotay-tay-buy-with-quantity
```

### Manual (SFTP/SSH)

Upload the `decotay-tay-buy-with-quantity` folder to:
```
/wp-content/plugins/decotay-tay-buy-with-quantity/
```
Then activate in **Plugins**.

---

## ⚙️ Configuration

The plugin works **out of the box** with zero configuration. However, you can customize via hooks:

### Available Filters

```php
// Customize button texts
add_filter('decotay_tay_bwq_buy_text', fn() => 'Purchase');
add_filter('decotay_tay_bwq_cart_text', fn() => 'Add to Basket');

// Modify max quantity
add_filter('decotay_tay_bwq_max_quantity', fn() => 50);

// Override attribute label
add_filter('decotay_tay_bwq_attribute_label', function($label, $attr_name, $product) {
    if ($attr_name === 'pa_color') return 'Colour';
    return $label;
}, 10, 3);

// Custom CSS class for wrapper
add_filter('decotay_tay_bwq_wrapper_class', fn($class) => $class . ' my-custom-class');
```

### Available Actions

```php
// Run code after successful add to cart
add_action('decotay_tay_bwq_after_add_to_cart', function($cart_item_key, $product_id, $variation_id, $quantity) {
    // Your custom logic (e.g., analytics, webhooks)
}, 10, 4);

// Invalidate cache for a product programmatically
do_action('decotay_tay_bwq_invalidate_cache', $product_id);
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WordPress + WooCommerce                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  decotay-tay-buy-with-quantity.php (Main Plugin)            │
│  • Asset enqueueing (CSS/JS modules)                        │
│  • AJAX endpoints (add_to_cart, get_variations, find_var)   │
│  • WooCommerce filters (purchasable, fragments)             │
│  • Nonce + i18n localization                                │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│  includes/              │   │  assets/                │
│  class-variations-api.php│   │  js/                    │
│  • REST API endpoints   │   │  ├── script.js          │
│  • Transient caching    │   │  │   └── Core + XStore  │
│  • Variation matching   │   │  │       adapter        │
└─────────────────────────┘   │  └── variations.js      │
                              │       └── Cache + Lazy  │
                              │  css/style.css          │
                              │       └── Styles + Hide │
                              └─────────────────────────┘
```

### Data Flow: Add to Cart (Variable Product)

```
User selects attributes
        │
        ▼
JavaScript: findVariation(productId, selectedAttrs)
        │
        ├─► REST API: POST /wp-json/decotay-tay-bwq/v1/find-variation
        │       └─► Match variation by attributes → return variation_id
        │
        └─► Fallback AJAX: decotay_tay_find_variation
                └─► Same matching logic
        │
        ▼
User clicks "Add to Cart"
        │
        ▼
AJAX: decotay_tay_add_to_cart (product_id, variation_id, quantity)
        │
        ▼
PHP: Filter woocommerce_variation_is_purchasable → allow if stock+price
        │
        ▼
WC()->cart->add_to_cart($parent_id, $qty, $variation_id, $attrs)
        │
        ▼
Return fragments → Trigger added_to_cart / wc_fragment_refresh
```

---

## 🎨 XStore + Elementor Integration

The plugin auto-detects XStore and applies dedicated handling:

| Feature | Implementation |
|---------|----------------|
| **Button Hiding** | CSS targets `.etheme-elementor-product .add_to_cart_button`, `.elementor-widget-theme-woocommerce_products .button`, `.ajax_add_to_cart` |
| **Elementor Widgets** | MutationObserver watches for `.elementor-widget-theme-woocommerce_products` |
| **Off-Canvas Cart** | Hides native quantity inputs in `.etheme-elementor-off-canvas` |
| **Product Loop** | Works with Elementor's Products widget (any skin: Grid, Carousel, List) |

> **No extra configuration needed** — just activate and it works.

---

## ⚡ Performance

### Caching Strategy (3 Layers)

| Layer | Storage | TTL | Scope |
|-------|---------|-----|-------|
| **Memory** | `Map` | 1 hour | Current session |
| **localStorage** | Browser | 24 hours | Cross-session |
| **WP Transient** | Database (object cache) | 1 hour | Server-side |

### Lazy Loading

- **IntersectionObserver** preloads variation data only when product enters viewport (+200px margin)
- **On-demand** fetching when user first interacts with attribute selectors
- **Request deduplication** — concurrent requests for same product share a single promise

### Bundle Size

| File | Size (gzipped) |
|------|----------------|
| `style.css` | ~1.2 KB |
| `script.js` | ~4.8 KB |
| `variations.js` | ~2.1 KB |
| **Total** | **~8 KB** |

---

## 🔌 API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/wp-json/decotay-tay-bwq/v1/variations/{product_id}` | GET | Get all variations + attributes for a variable product |
| `/wp-json/decotay-tay-bwq/v1/find-variation` | POST | Find variation ID by selected attributes |

**Headers Required:**
```
X-WP-Nonce: {wp_nonce}
Content-Type: application/json
```

**Example: Find Variation**

```javascript
const response = await fetch('/wp-json/decotay-tay-bwq/v1/find-variation', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': decotay_tay_bwq.nonce
    },
    body: JSON.stringify({
        product_id: 48540,
        attributes: {
            'pa_col-ter': 'laca-oxido',
            'pa_modelo': '1'
        }
    })
});
const data = await response.json();
// { variation_id: 48603, price: "...", stock: 99, image: "...", is_in_stock: true }
```

### AJAX Actions (Legacy)

| Action | Parameters | Returns |
|--------|------------|---------|
| `decotay_tay_add_to_cart` | `product_id`, `quantity`, `variation_id?`, `variation_attrs?` | `{ success, data: { message, cart_count, fragments } }` |
| `decotay_tay_get_variations` | `product_id` | `{ success, data: { attributes, variations, default_attrs } }` |
| `decotay_tay_find_variation` | `product_id`, `attributes` | `{ success, data: { variation_id, price, stock, image, ... } }` |
| `decotay_tay_get_permalink` | `product_id` | `{ success, data: { url } }` |

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Simple products: quantity + both buttons work
- [ ] Variable products: attribute dropdowns render correctly
- [ ] Dynamic updates: price/stock/image change on attribute selection
- [ ] "Add to Cart" adds correct variation + quantity via AJAX
- [ ] "Buy" redirects to product page with attributes in URL
- [ ] Mini-cart updates via fragments
- [ ] Pagination / infinite scroll: new products get UI injected
- [ ] Elementor Products widget: all skins (Grid, Carousel, List)
- [ ] Mobile responsive: stacked layout on <768px

### Automated Tests (Playwright)

```bash
# Run validation suite
python software/validate_playwright.py

# Test variation add-to-cart flow
python software/test_add_to_cart_network.py
```

---

## 🐛 Troubleshooting

### Buttons Not Appearing

1. **Clear all caches** (WP Cache, LSCache, Cloudflare, browser)
2. Verify products have `data-product_id` on add-to-cart buttons
3. Check browser console for JS errors
4. Ensure WooCommerce is active and products are published

### Variation Attributes Not Loading

1. Check REST API: `GET /wp-json/decotay-tay-bwq/v1/variations/{id}`
2. Verify product has attributes marked "Used for variations"
3. Confirm variations have stock status "instock" and price set
4. Clear transients: `wp transient delete --all --pattern='decotay_tay_bwq_*'`

### "Add to Cart" Fails Silently

1. Check browser Network tab for `admin-ajax.php` response
2. Verify `woocommerce_variation_is_purchasable` filter is active
3. Ensure variation has `stock_status = instock` and `price > 0`
4. Check PHP error logs for fatal errors

### XStore Native Buttons Still Visible

Add to your theme's `functions.php` or custom CSS:

```css
/* Force hide any remaining native buttons */
.products .button:not(.decotay-tay-bwq-button),
.elementor-widget-theme-woocommerce_products .button:not(.decotay-tay-bwq-button) {
    display: none !important;
}
```

---

## 🔧 Development

### Local Setup

```bash
# Clone
git clone https://github.com/selvaggiesteban/WooCommerce_Custom_Products_Archive.git
cd WooCommerce_Custom_Products_Archive

# Install WordPress (via Local, Docker, or VVV)
# Symlink plugin to wp-content/plugins/
ln -s /path/to/WooCommerce_Custom_Products_Archive /path/to/wp-content/plugins/decotay-tay-buy-with-quantity
```

### File Structure

```
├── decotay-tay-buy-with-quantity.php      # Main plugin file
├── includes/
│   └── class-variations-api.php           # REST API + variation logic
├── assets/
│   ├── js/
│   │   ├── script.js                      # Main entry point (ES module)
│   │   └── variations.js                  # Cache + lazy loading (ES module)
│   └── css/
│       └── style.css                      # All styles
├── software/                              # Deployment/validation scripts
├── LICENSE
└── README.md
```

### Building for Production

No build step required — vanilla JS/ES modules + CSS. Just deploy the folder.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Standards

- **PHP**: PSR-12, WordPress Coding Standards
- **JavaScript**: ES2020 modules, ESLint (Airbnb base)
- **CSS**: BEM methodology, CSS custom properties
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

---

## 📝 Changelog

### v2.0.0 (2026-10-28)
- ✅ Full variable product support (attribute selectors, dynamic price/stock/image)
- ✅ Fixed `woocommerce_variation_is_purchasable` filter for non-purchasable variations with stock
- ✅ Dual REST API + AJAX legacy with automatic fallback
- ✅ Multi-level caching (Memory + localStorage + Transients)
- ✅ Lazy loading via IntersectionObserver
- ✅ MutationObserver for dynamic content (AJAX, Elementor, pagination)
- ✅ XStore/Elementor dedicated adapter with native button hiding
- ✅ "Buy" (redirect) + "Add to Cart" (AJAX, stay on catalog) dual buttons

### v1.0.0 (2026-10-27)
- Initial release: quantity + buy button for simple products
- Basic XStore CSS overrides

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- **Author**: [Esteban Selvaggi](https://github.com/selvaggiesteban)
- **Sites**: [decotay.com.ar](https://decotay.com.ar) • [tay.com.ar](https://tay.com.ar)
- **Built for**: XStore Theme + Elementor + WooCommerce

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/selvaggiesteban/WooCommerce_Custom_Products_Archive/issues)
- **Discussions**: [GitHub Discussions](https://github.com/selvaggiesteban/WooCommerce_Custom_Products_Archive/discussions)
- **Email**: selvaggiesteban@gmail.com

---

<div align="center">

**Made with ❤️ for Decotay & Tay**

[⬆ Back to Top](#decotaytay---buy-with-quantity)

</div>