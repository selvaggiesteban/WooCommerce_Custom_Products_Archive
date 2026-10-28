<?php
/**
 * Endpoint REST personalizado para variaciones de alto rendimiento
 */

if (!defined('ABSPATH')) {
    exit;
}

class Decotay_Tay_BWQ_Variations_API {
    
    public static function init() {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }
    
    public static function register_routes() {
        register_rest_route('decotay-tay-bwq/v1', '/variations/(?P<product_id>\d+)', [
            'methods'  => 'GET',
            'callback' => [__CLASS__, 'get_variations'],
            'permission_callback' => '__return_true',
            'args'     => [
                'product_id' => [
                    'validate_callback' => function($param) {
                        return is_numeric($param) && $param > 0;
                    },
                ],
            ],
        ]);
        
        register_rest_route('decotay-tay-bwq/v1', '/find-variation', [
            'methods'  => 'POST',
            'callback' => [__CLASS__, 'find_variation'],
            'permission_callback' => '__return_true',
            'args'     => [
                'product_id'    => ['required' => true, 'validate_callback' => 'is_numeric'],
                'attributes'    => ['required' => true, 'type' => 'object'],
            ],
        ]);
    }
    
    public static function get_variations($request) {
        $product_id = (int) $request['product_id'];
        $product = wc_get_product($product_id);
        
        if (!$product || !$product->is_type('variable')) {
            return new WP_Error('invalid_product', 'Producto no válido', ['status' => 404]);
        }
        
        $cache_key = 'decotay_tay_bwq_rest_variations_' . $product_id;
        $cached = get_transient($cache_key);
        
        if ($cached !== false) {
            return rest_ensure_response($cached);
        }
        
        $data = self::build_variations_data($product);
        set_transient($cache_key, $data, HOUR_IN_SECONDS);
        
        return rest_ensure_response($data);
    }
    
    public static function find_variation($request) {
        $product_id = (int) $request['product_id'];
        $attributes = (array) $request['attributes'];
        
        $product = wc_get_product($product_id);
        if (!$product || !$product->is_type('variable')) {
            return new WP_Error('invalid_product', 'Producto no válido', ['status' => 404]);
        }
        
        $variation_id = self::match_variation($product, $attributes);
        
        if (!$variation_id) {
            return new WP_Error('no_match', 'No se encontró variación', ['status' => 404]);
        }
        
        $variation = wc_get_product($variation_id);
        
        return rest_ensure_response([
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
    
    private static function build_variations_data($product) {
        $data = [
            'attributes'   => [],
            'variations'   => [],
            'default_attrs'=> $product->get_default_attributes() ?: [],
        ];
        
        foreach ($product->get_attributes() as $attr_name => $attr_data) {
            if ($attr_data->get_variation()) {
                $term_ids = $attr_data->get_options();
                $options = [];
                foreach ($term_ids as $term_id) {
                    $term = get_term($term_id);
                    if ($term && !is_wp_error($term)) {
                        $options[] = $term->slug;
                    }
                }
                $data['attributes'][$attr_name] = [
                    'name'    => $attr_data->get_name(),
                    'label'   => wc_attribute_label($attr_name, $product),
                    'options' => $options,
                    'slug'    => $attr_name,
                ];
            }
        }
        
        $variation_ids = $product->get_children();
        
        foreach ($variation_ids as $var_id) {
            $variation = wc_get_product($var_id);
            if (!$variation) continue;
            $stock_status = $variation->get_stock_status();
            $price = $variation->get_price();
            if ($stock_status !== 'instock' || empty($price)) continue;
            
            $attrs = [];
            foreach ($variation->get_attributes() as $k => $v) {
                $attrs[$k] = $v;
            }
            
            $data['variations'][] = [
                'id'           => $variation->get_id(),
                'sku'          => $variation->get_sku(),
                'price_html'   => $variation->get_price_html(),
                'price'        => $variation->get_price(),
                'regular_price'=> $variation->get_regular_price(),
                'sale_price'   => $variation->get_sale_price(),
                'stock_qty'    => $variation->get_stock_quantity(),
                'stock_status' => $variation->get_stock_status(),
                'image'        => $variation->get_image_id() ? wp_get_attachment_image_url($variation->get_image_id(), 'woocommerce_thumbnail') : '',
                'image_id'     => $variation->get_image_id(),
                'attributes'   => $attrs,
                'in_stock'     => $variation->is_in_stock(),
                'weight'       => $variation->get_weight(),
                'dimensions'   => $variation->get_dimensions(),
            ];
        }
        
        return $data;
    }
    
    private static function match_variation($product, $selected_attrs) {
        $variation_ids = $product->get_children();
        
        foreach ($variation_ids as $var_id) {
            $variation = wc_get_product($var_id);
            if (!$variation) continue;
            $stock_status = $variation->get_stock_status();
            $price = $variation->get_price();
            if ($stock_status !== 'instock' || empty($price)) continue;
            
            $match = true;
            $var_attrs = $variation->get_attributes();
            
            foreach ($selected_attrs as $attr_name => $attr_value) {
                if (!isset($var_attrs[$attr_name]) || $var_attrs[$attr_name] !== $attr_value) {
                    $match = false;
                    break;
                }
            }
            
            if ($match) {
                return $variation->get_id();
            }
        }
        
        return 0;
    }
}

Decotay_Tay_BWQ_Variations_API::init();