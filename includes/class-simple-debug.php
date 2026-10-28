<?php
/**
 * Debug endpoint simple
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function() {
    register_rest_route('decotay-tay-bwq/v1', '/ping', [
        'methods'  => 'GET',
        'callback' => function() {
            return rest_ensure_response([
                'status' => 'ok',
                'wc_loaded' => function_exists('wc_get_product'),
                'wp_version' => get_bloginfo('version'),
            ]);
        },
        'permission_callback' => '__return_true',
    ]);
});