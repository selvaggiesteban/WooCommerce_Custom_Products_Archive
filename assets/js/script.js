/**
 * Decotay/Tay - Comprar con Cantidad
 * Core Agnóstico + Adapter XStore
 * Type: Module
 */

import { getVariations, findVariation, invalidateCache, preloadVisibleVariations } from './variations.js';

// ============================================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ============================================================

const State = {
    initialized: false,
    productWrappers: new Map(),     // productId -> { wrapper, form, selects, btnBuy, btnCart, msg }
    variationData: new Map(),       // productId -> datos de variaciones
    selectedAttrs: new Map(),       // productId -> { attr: value }
    isXStore: false,
    isElementor: false,
};

const Selectors = {
    product: '.product, li.product, .product-item, .wc-block-grid__product',
    addToCartBtn: '.add_to_cart_button[data-product_id], .product_type_simple[data-product_id], .product_type_variable[data-product_id]',
    xstoreProduct: '.etheme-elementor-product, .elementor-widget-theme-woocommerce_products .product, .products .product',
    xstoreAddToCart: '.etheme-add-to-cart-button, .product .button.product_type_variable, .product .button.product_type_simple',
    wrapper: '.decotay-tay-bwq-wrapper',
    form: '.decotay-tay-bwq-form',
    qtyInput: '.decotay-tay-bwq-qty',
    attrSelect: '.decotay-tay-bwq-attr-select',
    btnBuy: '.decotay-tay-bwq-buy-button',
    btnCart: '.decotay-tay-bwq-cart-button',
    msg: '.decotay-tay-bwq-message',
    attrContainer: '.decotay-tay-bwq-attributes',
    priceDisplay: '.decotay-tay-bwq-price',
    stockDisplay: '.decotay-tay-bwq-stock',
    imageDisplay: '.decotay-tay-bwq-image',
};

// ============================================================
// DETECCIÓN DE TEMA (XStore / Elementor)
// ============================================================

function detectTheme() {
    // Read theme info from localized script data
    State.isXStore = decotay_tay_bwq?.is_xstore === true;
    State.isElementor = decotay_tay_bwq?.is_elementor === true;
    
    // Fallback: detect from DOM if not in localized data
    if (!State.isXStore && document.body) {
        State.isXStore = document.body.classList.contains('theme-xstore') || 
                         document.querySelector('.etheme-elementor-widget-loaded') !== null ||
                         document.querySelector('[data-element_type="widget"][data-widget_type*="theme-"]') !== null;
    }
    if (!State.isElementor && document.body) {
        State.isElementor = document.querySelector('.elementor') !== null;
    }
    
    console.log('[DTBWQ] Theme detection:', { isXStore: State.isXStore, isElementor: State.isElementor });
}

// ============================================================
// FUNCIÓN PRINCIPAL: INYECTAR UI EN PRODUCTOS
// ============================================================

export function injectQuantityAndBuy() {
    if (State.initialized) return;
    
    const $ = jQuery;
    
    const $buttons = $(Selectors.addToCartBtn).add('[data-product_id].add_to_cart_button');
    
    $buttons.each(function() {
        const $btn = $(this);
        const productId = $btn.data('product_id');
        
        if (!productId || State.productWrappers.has(productId)) return;
        
        if ($btn.closest(Selectors.wrapper).length > 0) return;
        if ($btn.siblings(Selectors.wrapper).length > 0) return;
        
        const isVariable = $btn.hasClass('product_type_variable') || 
                          $btn.closest('.product').hasClass('product_type_variable') ||
                          $btn.data('product_type') === 'variable';
        
        hideNativeButton($btn);
        
        const wrapper = createWrapper(productId, isVariable);
        State.productWrappers.set(productId, wrapper);
        
        $btn.after(wrapper.$wrapper);
        
        if (isVariable) {
            initVariationSelectors(productId, wrapper);
        }
    });
    
    State.initialized = true;
    bindEvents();
    
    preloadVisibleVariations(getVisibleProductIds());
}

function hideNativeButton($btn) {
    $btn.hide().addClass('decotay-tay-bwq-hidden');
    $btn.siblings('.add_to_cart_button').hide().addClass('decotay-tay-bwq-hidden');
    $btn.closest('.etheme-add-to-cart-wrapper').find('.add_to_cart_button').hide();
}

function createWrapper(productId, isVariable) {
    const $ = jQuery;
    
    const $wrapper = $(`<div class="decotay-tay-bwq-wrapper" data-product-id="${productId}"></div>`);
    const $form = $(`<form class="decotay-tay-bwq-form" data-product-id="${productId}" novalidate></form>`);
    
    const $attrContainer = $(`<div class="decotay-tay-bwq-attributes" style="display:${isVariable ? 'block' : 'none'};"></div>`);
    const $priceDisplay = $(`<div class="decotay-tay-bwq-price"></div>`);
    const $stockDisplay = $(`<div class="decotay-tay-bwq-stock"></div>`);
    const $imageDisplay = $(`<div class="decotay-tay-bwq-image" style="display:none;"></div>`);
    
    const $qtyWrapper = $(`<div class="decotay-tay-bwq-qty-wrapper"></div>`);
    const $label = $(`<label class="decotay-tay-bwq-label" for="dtbwq-qty-${productId}">Cantidad:</label>`);
    const $input = $(`<input type="number" name="quantity" id="dtbwq-qty-${productId}" class="decotay-tay-bwq-qty" value="1" min="1" max="999" step="1">`);
    $qtyWrapper.append($label, $input);
    
    const $btnGroup = $(`<div class="decotay-tay-bwq-buttons"></div>`);
    const $btnBuy = $(`<button type="button" class="button decotay-tay-bwq-button decotay-tay-bwq-buy-button" data-action="buy">Comprar</button>`);
    const $btnCart = $(`<button type="submit" class="button decotay-tay-bwq-button decotay-tay-bwq-cart-button" data-action="cart">Agregar al carrito</button>`);
    $btnGroup.append($btnBuy, $btnCart);
    
    const $hiddenAction = $(`<input type="hidden" name="action" value="decotay_tay_add_to_cart">`);
    const $hiddenProductId = $(`<input type="hidden" name="product_id" value="${productId}">`);
    const $hiddenVariationId = $(`<input type="hidden" name="variation_id" value="">`);
    const $hiddenAttrs = $(`<input type="hidden" name="variation_attrs" value="">`);
    const $hiddenNonce = $(`<input type="hidden" name="decotay_tay_bwq_nonce" value="${decotay_tay_bwq.nonce}">`);
    
    const $message = $(`<div class="decotay-tay-bwq-message" data-product-id="${productId}"></div>`);
    
    $form.append($attrContainer, $priceDisplay, $stockDisplay, $imageDisplay, $qtyWrapper, $btnGroup, $hiddenAction, $hiddenProductId, $hiddenVariationId, $hiddenAttrs, $hiddenNonce);
    $wrapper.append($form, $message);
    
    return {
        $wrapper,
        $form,
        $attrContainer,
        $priceDisplay,
        $stockDisplay,
        $imageDisplay,
        $qtyInput: $input,
        $btnBuy,
        $btnCart,
        $message,
        $hiddenVariationId,
        $hiddenAttrs,
        isVariable,
        productId,
    };
}

async function initVariationSelectors(productId, wrapper) {
    const $ = jQuery;
    
    wrapper.$attrContainer.html(`<div class="decotay-tay-bwq-loading"></div>`);
    
    try {
        const data = await getVariations(productId);
        State.variationData.set(productId, data);
        
        renderAttributeSelectors(productId, wrapper, data);
        updatePriceStockImage(productId, wrapper, data);
        bindAttributeEvents(productId, wrapper);
        
    } catch (error) {
        console.error('[DTBWQ] Error cargando variaciones:', error);
        wrapper.$attrContainer.html(`<div class="decotay-tay-bwq-error">${decotay_tay_bwq.i18n.error}: ${error.message}</div>`);
    }
}

function renderAttributeSelectors(productId, wrapper, data) {
    const $ = jQuery;
    
    wrapper.$attrContainer.empty();
    
    if (!data.attributes || Object.keys(data.attributes).length === 0) {
        wrapper.$attrContainer.html(`<p class="decotay-tay-bwq-no-attrs">${decotay_tay_bwq.select_attrs}</p>`);
        return;
    }
    
    const selected = State.selectedAttrs.get(productId) || {};
    
    Object.entries(data.attributes).forEach(([attrName, attrData]) => {
        const $group = $(`<div class="decotay-tay-bwq-attr-group" data-attr="${attrName}"></div>`);
        const $label = $(`<label class="decotay-tay-bwq-attr-label" for="dtbwq-attr-${productId}-${attrName}">${attrData.label}:</label>`);
        
        const $select = $(`<select class="decotay-tay-bwq-attr-select" id="dtbwq-attr-${productId}-${attrName}" name="attribute_${attrName}" data-attr="${attrName}"></select>`);
        
        const defaultVal = data.default_attrs?.[attrName] || selected[attrName] || '';
        $select.append(`<option value="">Selecciona ${attrData.label}</option>`);
        
        // Opciones con label legible
        (attrData.options || []).forEach(opt => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : window.slugToLabel(opt);
            const $option = $(`<option value="${value}">${label}</option>`);
            if (value === defaultVal) $option.prop('selected', true);
            $select.append($option);
        });
        
        if (selected[attrName]) $select.val(selected[attrName]);
        
        $group.append($label, $select);
        wrapper.$attrContainer.append($group);
    });
    
    updateSelectedAttributes(productId, wrapper);
    updatePriceStockImage(productId, wrapper, data);
}

function bindAttributeEvents(productId, wrapper) {
    const $ = jQuery;
    
    wrapper.$attrContainer.off('change', Selectors.attrSelect).on('change', Selectors.attrSelect, async function() {
        const $select = $(this);
        const attrName = $select.data('attr');
        const value = $select.val();
        
        const selected = State.selectedAttrs.get(productId) || {};
        if (value) {
            selected[attrName] = value;
        } else {
            delete selected[attrName];
        }
        State.selectedAttrs.set(productId, selected);
        
        wrapper.$hiddenAttrs.val(JSON.stringify(selected));
        
        await updatePriceStockImage(productId, wrapper, State.variationData.get(productId));
        
        const hasVariation = !!wrapper.$hiddenVariationId.val();
        wrapper.$btnCart.prop('disabled', !hasVariation);
    });
}

async function updatePriceStockImage(productId, wrapper, data) {
    if (!data || !data.variations) return;
    
    const selected = State.selectedAttrs.get(productId) || {};
    const selectedKeys = Object.keys(selected);
    
    let matchedVar = null;
    
    if (selectedKeys.length > 0) {
        // Buscar coincidencia exacta con stock
        for (const v of data.variations) {
            let match = true;
            for (const [key, val] of Object.entries(selected)) {
                if (v.attributes[key] !== val) {
                    match = false;
                    break;
                }
            }
            if (match && v.in_stock) {
                matchedVar = v;
                break;
            }
        }
        
        // Si no hay coincidencia exacta con stock, buscar coincidencia parcial
        if (!matchedVar) {
            for (const v of data.variations) {
                let match = true;
                for (const [key, val] of Object.entries(selected)) {
                    if (v.attributes[key] !== val) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    matchedVar = v;
                    break;
                }
            }
        }
    }
    
    if (matchedVar) {
        wrapper.$hiddenVariationId.val(matchedVar.id);
        
        // PRECIO
        wrapper.$priceDisplay.html(matchedVar.price_html || '');
        wrapper.$priceDisplay.removeClass('empty');
        
        // STOCK
        if (matchedVar.stock_qty !== null && matchedVar.stock_qty !== '') {
            const stockText = matchedVar.in_stock 
                ? `${matchedVar.stock_qty} ${matchedVar.stock_qty === 1 ? 'disponible' : 'disponibles'}`
                : decotay_tay_bwq.out_of_stock;
            wrapper.$stockDisplay.html(`<span class="${matchedVar.in_stock ? 'in-stock' : 'out-of-stock'}">${stockText}</span>`).show();
        } else {
            wrapper.$stockDisplay.html(matchedVar.in_stock ? '<span class="in-stock">Disponible</span>' : `<span class="out-of-stock">${decotay_tay_bwq.out_of_stock}</span>`).show();
        }
        
        // IMAGEN DESTACADA - Actualizar la imagen principal del producto
        if (matchedVar.image) {
            updateFeaturedImage(wrapper, matchedVar.image);
        }
        
        wrapper.$btnCart.prop('disabled', !matchedVar.in_stock);
    } else {
        wrapper.$hiddenVariationId.val('');
        wrapper.$priceDisplay.html('').addClass('empty');
        wrapper.$stockDisplay.hide();
        wrapper.$btnCart.prop('disabled', true);
    }
}

/**
 * Actualiza la imagen destacada del producto en el loop
 */
function updateFeaturedImage(wrapper, imageUrl) {
    const $product = wrapper.$wrapper.closest('.product, li.product, .product-item, .etheme-elementor-product, [data-product_id]');
    if (!$product.length) return;
    
    // Buscar la imagen principal del producto
    const $mainImage = $product.find('img').first();
    if ($mainImage.length) {
        // Guardar imagen original si no existe
        if (!$mainImage.data('dtbwq-original-src')) {
            $mainImage.data('dtbwq-original-src', $mainImage.attr('src'));
        }
        // Actualizar con la imagen de la variación
        $mainImage.attr('src', imageUrl);
    }
}

function updateSelectedAttributes(productId, wrapper) {
    const selected = State.selectedAttrs.get(productId) || {};
    wrapper.$hiddenAttrs.val(JSON.stringify(selected));
    wrapper.$attrContainer.find(Selectors.attrSelect).each(function() {
        const $select = jQuery(this);
        const attrName = $select.data('attr');
        if (selected[attrName]) {
            $select.val(selected[attrName]);
        }
    });
}

function getVisibleProductIds() {
    const ids = [];
    document.querySelectorAll('[data-product_id]').forEach(el => {
        const id = parseInt(el.dataset.productId || el.getAttribute('data-product_id'), 10);
        if (id) ids.push(id);
    });
    return [...new Set(ids)];
}

// ============================================================
// EVENTOS GLOBALES
// ============================================================

function bindEvents() {
    const $ = jQuery;
    const $doc = $(document);
    
    $doc.on('submit', Selectors.form, handleAddToCart);
    $doc.on('click', Selectors.btnBuy, handleBuyRedirect);
    $doc.on('change', Selectors.qtyInput, function() {
        const val = Math.max(1, parseInt(this.value, 10) || 1);
        this.value = val;
    });
    
    $doc.on('change', Selectors.attrSelect, function() {
        const $form = $(this).closest(Selectors.form);
        const productId = $form.data('product-id');
        const wrapper = State.productWrappers.get(productId);
        if (wrapper) {
            bindAttributeEvents(productId, wrapper);
        }
    });
}

async function handleAddToCart(e) {
    e.preventDefault();
    
    const $ = jQuery;
    const $form = $(this);
    const productId = $form.data('product-id');
    const wrapper = State.productWrappers.get(productId);
    
    if (!wrapper) return;
    
    const $btn = wrapper.$btnCart;
    const $msg = wrapper.$message;
    const quantity = wrapper.$qtyInput.val();
    const variationId = wrapper.$hiddenVariationId.val();
    const variationAttrs = wrapper.$hiddenAttrs.val() ? JSON.parse(wrapper.$hiddenAttrs.val()) : {};
    
    if (wrapper.isVariable && !variationId) {
        showMessage($msg, decotay_tay_bwq.select_attrs, 'error');
        return;
    }
    
    $btn.prop('disabled', true).text(decotay_tay_bwq.adding);
    $msg.removeClass('success error').text('');
    
    try {
        const formData = new FormData();
        formData.append('action', 'decotay_tay_add_to_cart');
        formData.append('product_id', productId);
        formData.append('quantity', quantity);
        if (variationId) formData.append('variation_id', variationId);
        if (Object.keys(variationAttrs).length) formData.append('variation_attrs', JSON.stringify(variationAttrs));
        formData.append('decotay_tay_bwq_nonce', decotay_tay_bwq.nonce);
        
        const response = await fetch(decotay_tay_bwq.ajax_url, {
            method: 'POST',
            body: formData,
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage($msg, result.data.message, 'success');
            $btn.text(decotay_tay_bwq.added);
            
            $(document.body).trigger('added_to_cart', [result.data.fragments, result.data.cart_hash, $btn]);
            $(document.body).trigger('wc_fragment_refresh');
            
            invalidateCache(productId);
            
            setTimeout(() => {
                $btn.text(decotay_tay_bwq.cart_text).prop('disabled', false);
                $msg.text('');
            }, 2000);
        } else {
            showMessage($msg, result.data?.message || decotay_tay_bwq.i18n.error, 'error');
            $btn.text(decotay_tay_bwq.cart_text).prop('disabled', false);
        }
    } catch (error) {
        console.error('[DTBWQ] Error adding to cart:', error);
        showMessage($msg, decotay_tay_bwq.i18n.error, 'error');
        $btn.text(decotay_tay_bwq.cart_text).prop('disabled', false);
    }
}

function handleBuyRedirect(e) {
    e.preventDefault();
    
    const $ = jQuery;
    const $btn = $(this);
    const $form = $btn.closest(Selectors.form);
    const productId = $form.data('product-id');
    const wrapper = State.productWrappers.get(productId);
    
    if (!wrapper) return;
    
    const $originalBtn = $form.siblings('.add_to_cart_button[data-product_id="' + productId + '"]');
    let productUrl = $originalBtn.data('product_url') || $originalBtn.attr('href');
    
    if (!productUrl) {
        const $productLink = $form.closest('.product').find('a.woocommerce-LoopProduct-link, a.product-content-image').first();
        productUrl = $productLink.attr('href');
    }
    
    if (!productUrl) {
        fetch(decotay_tay_bwq.ajax_url, {
            method: 'POST',
            body: new URLSearchParams({
                action: 'decotay_tay_get_permalink',
                product_id: productId,
                decotay_tay_bwq_nonce: decotay_tay_bwq.nonce,
            }),
        })
        .then(r => r.json())
        .then(r => {
            if (r.success && r.data.url) {
                window.location.href = r.data.url;
            }
        });
        return;
    }
    
    if (wrapper.isVariable) {
        const variationId = wrapper.$hiddenVariationId.val();
        const variationAttrs = wrapper.$hiddenAttrs.val() ? JSON.parse(wrapper.$hiddenAttrs.val()) : {};
        
        if (variationId && Object.keys(variationAttrs).length) {
            const params = new URLSearchParams();
            Object.entries(variationAttrs).forEach(([k, v]) => params.append(k, v));
            productUrl += (productUrl.includes('?') ? '&' : '?') + params.toString();
        }
    }
    
    window.location.href = productUrl;
}

function showMessage($el, text, type) {
    $el.removeClass('success error').addClass(type).text(text);
}

// ============================================================
// OBSERVER PARA CONTENIDO DINÁMICO (AJAX, PAGINACIÓN, ELEMENTOR)
// ============================================================

function createObserver() {
    const observer = new MutationObserver((mutations) => {
        let shouldReinit = false;
        
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const $node = jQuery(node);
                    
                    if ($node.is(Selectors.addToCartBtn) || $node.find(Selectors.addToCartBtn).length > 0) {
                        shouldReinit = true;
                    }
                    
                    if ($node.hasClass('elementor-widget-theme-woocommerce_products') || 
                        $node.find('.elementor-widget-theme-woocommerce_products').length > 0) {
                        shouldReinit = true;
                    }
                }
            });
        });
        
        if (shouldReinit) {
            clearTimeout(window._dtbwq_observer_timer);
            window._dtbwq_observer_timer = setTimeout(() => {
                State.initialized = false;
                injectQuantityAndBuy();
            }, 300);
        }
    });
    
    return observer;
}

// ============================================================
// EVENTOS WOCOMMERCE
// ============================================================

function bindWooCommerceEvents() {
    jQuery(document).on('added_to_cart updated_cart_totals wc_fragment_refresh', () => {
        setTimeout(() => {
            State.initialized = false;
            injectQuantityAndBuy();
        }, 500);
    });
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

function init() {
    detectTheme();
    injectQuantityAndBuy();
    
    // Observer para contenido dinámico (después de que el DOM esté listo)
    const observer = createObserver();
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        }, { once: true });
    }
    
    bindWooCommerceEvents();
}

jQuery(init);

// Exportar para testing/debug
window.DecotayTayBWQ = window.DecotayTayBWQ || {};
window.DecotayTayBWQ.State = State;
window.DecotayTayBWQ.getVariations = getVariations;
window.DecotayTayBWQ.findVariation = findVariation;