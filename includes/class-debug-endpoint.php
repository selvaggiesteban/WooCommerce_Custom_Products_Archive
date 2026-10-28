<?php
/**
 * Debug endpoint para REST API
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function() {
    register_rest_route('decotay-tay-bwq/v1', '/debug-product/(?P<product_id>\d+)', [
        'methods'  => 'GET',
        'callback' => function($request) {
            $product_id = (int) $request['product_id'];
            $product = wc_get_product($product_id);
            
            if (!$product) {
                return rest_ensure_response(['error' => 'Product not found']);
            }
            
            $children = $product->get_children();
            $debug = [
                'product_id' => $product_id,
                'product_name' => $product->get_name(),
                'product_type' => $product->get_type(),
                'children_ids' => $children,
                'children_count' => count($children),
                'wc_loaded' => function_exists('wc_get_product'),
                'variations' => [],
            ];
            
            foreach ($children as $var_id) {
                $var = wc_get_product($var_id);
                if (!$var) {
                    $debug['variations'][] = ['id' => $var_id, 'error' => 'wc_get_product returned null'];
                    continue;
                }
                
                $debug['variations'][] = [
                    'id' => $var->get_id(),
                    'name' => $var->get_name(),
                    'price' => $var->get_price(),
                    'stock_status' => $var->get_stock_status(),
                    'purchasable' => $var->is_purchasable(),
                    'in_stock' => $var->is_in_stock(),
                    'attributes' => $var->get_attributes(),
                ];
            }
            
            return rest_ensure_response($debug);
        },
        'permission_callback' => '__return_true',
    ]);
});