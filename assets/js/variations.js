/**
 * Módulo de Variaciones - Alto Rendimiento
 * Labels legibles, precio/stock/imagen dinámicos
 */

const VariationCache = new Map();
const PendingRequests = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const STORAGE_PREFIX = 'dtbwq_var_';

/**
 * Normalizar slug a label legible
 * "laca-oxido" → "Laca + Óxido"
 * "negro-micro-texturado" → "Negro Micro Texturado"
 */
function slugToLabel(slug) {
    if (!slug) return slug;
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace(/\+/g, ' + ');
}

/**
 * Obtener variaciones con labels legibles en options
 */
export async function getVariations(productId) {
    const cacheKey = `variations_${productId}`;
    
    if (VariationCache.has(cacheKey)) {
        const cached = VariationCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
        VariationCache.delete(cacheKey);
    }
    
    try {
        const stored = localStorage.getItem(STORAGE_PREFIX + cacheKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
                VariationCache.set(cacheKey, parsed);
                return parsed.data;
            }
            localStorage.removeItem(STORAGE_PREFIX + cacheKey);
        }
    } catch (e) {}
    
    if (PendingRequests.has(cacheKey)) return PendingRequests.get(cacheKey);
    
    const promise = fetchVariations(productId);
    PendingRequests.set(cacheKey, promise);
    
    try {
        const data = await promise;
        // Enriquecer con labels legibles
        const enriched = enrichVariationData(data);
        cacheData(cacheKey, enriched);
        return enriched;
    } finally {
        PendingRequests.delete(cacheKey);
    }
}

function enrichVariationData(data) {
    if (!data.attributes) return data;
    
    const enriched = { ...data };
    enriched.attributes = { ...data.attributes };
    
    Object.keys(enriched.attributes).forEach(attrName => {
        const attr = enriched.attributes[attrName];
        if (attr.options && Array.isArray(attr.options)) {
            attr.options = attr.options.map(opt => ({
                value: opt,
                label: slugToLabel(opt)
            }));
        }
    });
    
    return enriched;
}

export async function findVariation(productId, attributes) {
    const cacheKey = `find_${productId}_${JSON.stringify(attributes)}`;
    
    if (VariationCache.has(cacheKey)) return VariationCache.get(cacheKey);
    
    try {
        const restUrl = `${decotay_tay_bwq.rest_url}find-variation`;
        const response = await fetch(restUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': decotay_tay_bwq.nonce,
            },
            body: JSON.stringify({ product_id: productId, attributes }),
        });
        
        if (response.ok) {
            const data = await response.json();
            VariationCache.set(cacheKey, data);
            return data;
        }
    } catch (e) {}
    
    const formData = new FormData();
    formData.append('action', 'decotay_tay_find_variation');
    formData.append('product_id', productId);
    formData.append('attributes', JSON.stringify(attributes));
    formData.append('decotay_tay_bwq_nonce', decotay_tay_bwq.nonce);
    
    const ajaxResponse = await fetch(decotay_tay_bwq.ajax_url, {
        method: 'POST',
        body: formData,
    });
    
    const result = await ajaxResponse.json();
    if (result.success) {
        VariationCache.set(cacheKey, result.data);
        return result.data;
    }
    
    throw new Error(result.data?.message || 'Variación no encontrada');
}

async function fetchVariations(productId) {
    try {
        const restUrl = `${decotay_tay_bwq.rest_url}variations/${productId}`;
        const response = await fetch(restUrl, {
            headers: { 'X-WP-Nonce': decotay_tay_bwq.nonce },
        });
        if (response.ok) return response.json();
    } catch (e) {}
    
    const formData = new FormData();
    formData.append('action', 'decotay_tay_get_variations');
    formData.append('product_id', productId);
    formData.append('decotay_tay_bwq_nonce', decotay_tay_bwq.nonce);
    
    const ajaxResponse = await fetch(decotay_tay_bwq.ajax_url, {
        method: 'POST',
        body: formData,
    });
    
    const result = await ajaxResponse.json();
    if (result.success) return result.data;
    throw new Error(result.data?.message || 'Error al cargar variaciones');
}

function cacheData(key, data) {
    const entry = { data, timestamp: Date.now() };
    VariationCache.set(key, entry);
    try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
        cleanupOldCache();
    } catch (e) {}
}

function cleanupOldCache() {
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) {
            try {
                const entry = JSON.parse(localStorage.getItem(key));
                if (now - entry.timestamp > 24 * CACHE_TTL) localStorage.removeItem(key);
            } catch (e) { localStorage.removeItem(key); }
        }
    }
}

export function invalidateCache(productId) {
    const key = `variations_${productId}`;
    VariationCache.delete(key);
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (e) {}
}

export function preloadVisibleVariations(productIds) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = parseInt(entry.target.dataset.productId || entry.target.getAttribute('data-product_id'), 10);
                if (id && !VariationCache.has(`variations_${id}`)) {
                    getVariations(id).catch(() => {});
                }
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '200px' });
    
    productIds.forEach(id => {
        const el = document.querySelector(`[data-product-id="${id}"]`) || 
                   document.querySelector(`[data-product_id="${id}"]`);
        if (el) observer.observe(el);
    });
}

// Exportar para uso global en script.js
window.slugToLabel = slugToLabel;