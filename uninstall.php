<?php
// Si el plugin se desinstala desde WordPress, no hace falta limpiar tablas
// (este plugin no crea tablas en la base de datos).
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
