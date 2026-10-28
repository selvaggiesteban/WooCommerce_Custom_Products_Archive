<?php
/**
 * Plugin Name: Decotay/Tay - Comprar con Cantidad
 * Description: Selector de cantidad + botones Comprar/Agregar al carrito en archivo de productos, con soporte completo para variaciones (atributos, precio dinámico, stock, imagen). Agnóstico con adapter dedicado para XStore.
 * Version: 2.0.0
 * Author: Decotay/Tay
 * Text Domain: decotay-tay-bwq
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 6.0
 * WC tested up to: 9.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('DECOTAY_TAY_BWQ_VERSION', '2.0.0');
define('DECOTAY_TAY_BWQ_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('DECOTAY_TAY_BWQ_PLUGIN_URL', plugin_dir_url(__FILE__));
define('DECOTAY_TAY_BWQ_ASSETS_URL', DECOTAY_TAY_BWQ_PLUGIN_URL . 'assets/');

require_once DECOTAY_TAY_BWQ_PLUGIN_DIR . 'includes/class-variations-api.php';

class Decotay_Tay_Buy_With_Quantity {
    
    private static $instance = null;
    
    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_decotay_tay_add_to_cart', [$this, 'ajax_add_to_cart']);
        add_action('wp_ajax_nopriv_decotay_tay_add_to_cart', [$this, 'ajax_add_to_cart']);
        add_action('wp_ajax_decotay_tay_get_variations', [$this, 'ajax_get_variations']);
        add_action('wp_ajax_nopriv_decotay_tay_get_variations', [$this, 'ajax_get_variations']);
        add_action('wp_ajax_decotay_tay_find_variation', [$this, 'ajax_find_variation']);
        add_action('wp_ajax_nopriv_decotay_tay_find_variation', [$this, 'ajax_find_variation']);
        add_action('wp_ajax_decotay_tay_get_permalink', [$this, 'ajax_get_permalink']);
        add_action('wp_ajax_nopriv_decotay_tay_get_permalink', [$this, 'ajax_get_permalink']);
        add_action('wp_head', [$this, 'inline_config'], 20);
        add_filter('script_loader_tag', [$this, 'add_module_attribute'], 10, 3);
    }
    
    public function enqueue_assets() {
        $nonce = wp_create_nonce('decotay_tay_bwq_nonce');
        
        wp_enqueue_style(
            'decotay-tay-bwq-style',
            DECOTAY_TAY_BWQ_ASSETS_URL . 'css/style.css',
            [],
            DECOTAY_TAY_BWQ_VERSION
        );
        
        wp_enqueue_script(
            'decotay-tay-bwq-variations',
            DECOTAY_TAY_BWQ_ASSETS_URL . 'js/variations.js',
            [],
            DECOTAY_TAY_BWQ_VERSION,
            true
        );
        
        wp_enqueue_script(
            'decotay-tay-bwq-script',
            DECOTAY_TAY_BWQ_ASSETS_URL . 'js/script.js',
            ['jquery', 'decotay-tay-bwq-variations'],
            DECOTAY_TAY_BWQ_VERSION,
            true
        );
        
        wp_localize_script('decotay-tay-bwq-script', 'decotay_tay_bwq', [
            'ajax_url'      => admin_url('admin-ajax.php'),
            'rest_url'      => rest_url('decotay-tay-bwq/v1/'),
            'nonce'         => $nonce,
            'adding'        => __('Agregando...', 'decotay-tay-bwq'),
            'added'         => __('Agregado', 'decotay-tay-bwq'),
            'buy_text'      => __('Comprar', 'decotay-tay-bwq'),
            'cart_text'     => __('Agregar al carrito', 'decotay-tay-bwq'),
            'select_attrs'  => __('Selecciona los atributos', 'decotay-tay-bwq'),
            'out_of_stock'  => __('Sin stock', 'decotay-tay-bwq'),
            'i18n'          => [
                'select_option' => __('Selecciona una opción', 'decotay-tay-bwq'),
                'loading'       => __('Cargando...', 'decotay-tay-bwq'),
                'error'         => __('Error', 'decotay-tay-bwq'),
            ],
        ]);
    }
    
    public function add_module_attribute($tag, $handle, $src) {
        if ('decotay-tay-bwq-variations' === $handle || 'decotay-tay-bwq-script' === $handle) {
            return str_replace('<script ', '<script type="module" ', $tag);
        }
        return $tag;
    }
    
    public function inline_config() {
        ?>
        <script>
        window.DecotayTayBWQ = window.DecotayTayBWQ || {};
        window.DecotayTayBWQ.isXStore = document.body.classList.contains('theme-xstore') || 
                                        document.querySelector('.etheme-elementor-widget-loaded') !== null ||
                                        document.querySelector('[data-element_type="widget"][data-widget_type*="theme-"]') !== null;
        window.DecotayTayBWQ.isElementor = document.querySelector('.elementor') !== null;
        </script>
        <?php
    }
    
    public function ajax_add_to_cart() {
        check_ajax_referer('decotay_tay_bwq_nonce', 'decotay_tay_bwq_nonce');
        
        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        $quantity   = isset($_POST['quantity']) ? absint($_POST['quantity']) : 1;
        $variation_id = isset($_POST['variation_id']) ? absint($_POST['variation_id']) : 0;
        $variation_attrs = isset($_POST['variation_attrs']) ? json_decode(stripslashes($_POST['variation_attrs']), true) : [];
        
        if (!$product_id) {
            wp_send_json_error(['message' => __('Producto inválido', 'decotay-tay-bwq')]);
        }
        
        $product = wc_get_product($product_id);
        if (!$product) {
            wp_send_json_error(['message' => __('Producto no encontrado', 'decotay-tay-bwq')]);
        }
        
        if ($product->is_type('variable')) {
            if (!$variation_id && !empty($variation_attrs)) {
                $variation_id = $this->find_matching_variation($product, $variation_attrs);
            }
            if (!$variation_id) {
                wp_send_json_error(['message' => __('Selecciona los atributos del producto', 'decotay-tay-bwq')]);
            }
            $variation = wc_get_product($variation_id);
            if (!$variation || !$variation->is_purchasable()) {
                wp_send_json_error(['message' => __('Esta variación no está disponible', 'decotay-tay-bwq')]);
            }
            $cart_item_key = WC()->cart->add_to_cart($product_id, $quantity, $variation_id, $variation_attrs);
        } else {
            if (!$product->is_purchasable()) {
                wp_send_json_error(['message' => __('Este producto no se puede comprar', 'decotay-tay-bwq')]);
            }
            $cart_item_key = WC()->cart->add_to_cart($product_id, $quantity);
        }
        
        if ($cart_item_key) {
            WC()->cart->calculate_totals();
            wp_send_json_success([
                'message'    => sprintf(_n('%s agregado al carrito.', '%s agregados al carrito.', $quantity, 'decotay-tay-bwq'), $product->get_name()),
                'cart_count' => WC()->cart->get_cart_contents_count(),
                'fragments'  => $this->get_cart_fragments(),
            ]);
        } else {
            wp_send_json_error(['message' => __('No se pudo agregar al carrito', 'decotay-tay-bwq')]);
        }
    }
    
    public function ajax_get_variations() {
        check_ajax_referer('decotay_tay_bwq_nonce', 'decotay_tay_bwq_nonce');
        
        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        
        if (!$product_id) {
            wp_send_json_error(['message' => __('Producto inválido', 'decotay-tay-bwq')]);
        }
        
        $product = wc_get_product($product_id);
        if (!$product || !$product->is_type('variable')) {
            wp_send_json_error(['message' => __('Producto no es variable', 'decotay-tay-bwq')]);
        }
        
        $cache_key = 'decotay_tay_bwq_variations_' . $product_id;
        $cached = get_transient($cache_key);
        
        if ($cached !== false) {
            wp_send_json_success($cached);
        }
        
        $variations = $this->get_variations_data($product);
        set_transient($cache_key, $variations, HOUR_IN_SECONDS);
        
        wp_send_json_success($variations);
    }
    
    public function ajax_find_variation() {
        check_ajax_referer('decotay_tay_bwq_nonce', 'decotay_tay_bwq_nonce');
        
        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        $attributes = isset($_POST['attributes']) ? json_decode(stripslashes($_POST['attributes']), true) : [];
        
        $product = wc_get_product($product_id);
        if (!$product || !$product->is_type('variable')) {
            wp_send_json_error(['message' => 'Producto no válido']);
        }
        
        $variation_id = $this->find_matching_variation($product, $attributes);
        
        if ($variation_id) {
            $variation = wc_get_product($variation_id);
            wp_send_json_success([
                'variation_id' => $variation_id,
                'price'        => $variation->get_price_html(),
                'regular_price'=> wc_price($variation->get_regular_price()),
                'sale_price'   => $variation->get_sale_price() ? wc_price($variation->get_sale_price()) : null,
                'stock'        => $variation->get_stock_quantity(),
                'stock_status' => $variation->get_stock_status(),
                'image'        => $variation->get_image_id() ? wp_get_attachment_image_url($variation->get_image_id(), 'woocommerce_thumbnail') : '',
                'is_in_stock'  => $variation->is_in_stock(),
                'sku'          => $variation->get_sku(),
            ]);
        }
        
        wp_send_json_error(['message' => 'Variación no encontrada']);
    }
    
    public function ajax_get_permalink() {
        check_ajax_referer('decotay_tay_bwq_nonce', 'decotay_tay_bwq_nonce');
        
        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        $product = wc_get_product($product_id);
        
        if ($product) {
            wp_send_json_success(['url' => $product->get_permalink()]);
        }
        
        wp_send_json_error(['message' => 'Producto no encontrado']);
    }
    
    private function get_variations_data($product) {
        $data = [
            'attributes' => [],
            'variations' => [],
            'default_attrs' => [],
        ];
        
        foreach ($product->get_attributes() as $attr_name => $attr_data) {
            if ($attr_data->get_variation()) {
                $options = $attr_data->get_options();
                $data['attributes'][$attr_name] = [
                    'name'     => $attr_data->get_name(),
                    'label'    => wc_attribute_label($attr_name, $product),
                    'options'  => $options,
                    'slug'     => $attr_name,
                ];
            }
        }
        
        $variation_ids = $product->get_children();
        foreach ($variation_ids as $var_id) {
            $variation = wc_get_product($var_id);
            if (!$variation || !$variation->is_purchasable()) {
                continue;
            }
            
            $attrs = [];
            foreach ($variation->get_attributes() as $attr_name => $attr_value) {
                $attrs[$attr_name] = $attr_value;
            }
            
            $data['variations'][] = [
                'id'           => $variation->get_id(),
                'sku'          => $variation->get_sku(),
                'price'        => $variation->get_price_html(),
                'regular_price' => wc_price($variation->get_regular_price()),
                'sale_price'   => $variation->get_sale_price() ? wc_price($variation->get_sale_price()) : null,
                'stock'        => $variation->get_stock_quantity(),
                'stock_status' => $variation->get_stock_status(),
                'image'        => $variation->get_image_id() ? wp_get_attachment_image_url($variation->get_image_id(), 'woocommerce_thumbnail') : '',
                'attributes'   => $attrs,
                'is_in_stock'  => $variation->is_in_stock(),
            ];
        }
        
        $default_attrs = $product->get_default_attributes();
        if ($default_attrs) {
            foreach ($default_attrs as $key => $val) {
                $data['default_attrs'][$key] = $val;
            }
        }
        
        return $data;
    }
    
    private function find_matching_variation($product, $selected_attrs) {
        $variation_ids = $product->get_children();
        
        foreach ($variation_ids as $var_id) {
            $variation = wc_get_product($var_id);
            if (!$variation) continue;
            
            $match = true;
            foreach ($selected_attrs as $attr_name => $attr_value) {
                $var_attrs = $variation->get_attributes();
                if (!isset($var_attrs[$attr_name]) || $var_attrs[$attr_name] !== $attr_value) {
                    $match = false;
                    break;
                }
            }
            
            if ($match && $variation->is_purchasable()) {
                return $variation->get_id();
            }
        }
        
        return 0;
    }
    
    private function get_cart_fragments() {
        ob_start();
        woocommerce_mini_cart();
        $mini_cart = ob_get_clean();
        
        return [
            'div.widget_shopping_cart_content' => $mini_cart,
        ];
    }
}

Decotay_Tay_Buy_With_Quantity::instance();

register_activation_hook(__FILE__, function() {
    flush_rewrite_rules();
});

register_deactivation_hook(__FILE__, function() {
    flush_rewrite_rules();
    global $wpdb;
    $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_decotay_tay_bwq_%' OR option_name LIKE '_transient_timeout_decotay_tay_bwq_%'");
});