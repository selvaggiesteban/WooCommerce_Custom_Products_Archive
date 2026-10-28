<?php
/**
 * Endpoint REST con debug temporal
 */

if (!defined('ABSPATH')) {
    exit;
}

class Decotay_Tay_BWQ_Variations_API_Debug {
    
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
        
        // Debug endpoint
        register_rest_route('decotay-tay-bwq/v1', '/debug-variations/(?P<product_id>\d+)', [
            'methods'  => 'GET',
            'callback' => [__CLASS__, 'debug_variations'],
            'permission_callback' => '__return_true',
        ]);
    }
    
    public static function debug_variations($request) {
        $product_id = (int) $request['product_id'];
        $product = wc_get_product($product_id);
        
        if (!$product || !$product->is_type('variable')) {
            return rest_ensure_response(['error' => 'Invalid product']);
        }
        
        $debug = [
            'product_id' => $product_id,
            'product_name' => $product->get_name(),
            'product_type' => $product->get_type(),
            'children_ids' => $product->get_children(),
            'children_count' => count($product->get_children()),
            'variations' => [],
        ];
        
        foreach ($product->get_children() as $var_id) {
            $var = wc_get_product($var_id);
            if (!$var) {
                $debug['variations'][] = ['id' => $var_id, 'error' => 'wc_get_product returned null'];
                continue;
            }
            
            $debug['variations'][] = [
                'id' => $var->get_id(),
                'name' => $var->get_name(),
                'price' => $var->get_price(),
                'regular_price' => $var->get_regular_price(),
                'stock_status' => $var->get_stock_status(),
                'stock_qty' => $var->get_stock_quantity(),
                'purchasable' => $var->is_purchasable(),
                'in_stock' => $var->is_in_stock(),
                'attributes' => $var->get_attributes(),
            ];
        }
        
        return rest_ensure_response($debug);
    }
}

Decotay_Tay_BWQ_Variations_API_Debug::init();