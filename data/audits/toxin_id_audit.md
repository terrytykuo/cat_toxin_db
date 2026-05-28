# Toxin ID Audit

Generated: 2026-05-28T11:39:49.879Z
Firestore source: firestore (toxins collection)

## Summary

- Site-visible toxins: 150 (100 plants, 50 foods)
- Firestore docs inspected: 211
- Firestore docs with images: 207
- Current site-visible entries without canonical images: 32
- Resolved by legacy id: 14
- Resolved by shared image: 15
- Explicit missing Firestore images: 3
- Unresolved: 0
- Duplicate canonical ids: 0
- Duplicate concept groups for review: 4

## Current Missing Images

| Canonical ID | Category | Name | Status | Suggested source | Notes |
| --- | --- | --- | --- | --- | --- |
| `agapanthus_africanus_or_a_orientalis` | plant | Agapanthus Africanus Or A Orientalis | resolved_by_shared_image | `agapanthus_orientalis_or_agapanthus_africanus` | agapanthus_orientalis_or_agapanthus_africanus (manual audit hint; exact) |
| `agastache_spp` | plant | Hummingbird Mint | resolved_by_shared_image | `hummingbird_mint` | hummingbird_mint (name slug; exact) |
| `allium_cepa` | plant | Allium Cepa | resolved_by_shared_image | `onions` | onions (manual audit hint; exact) |
| `allium_porrum` | plant | Allium Porrum | resolved_by_shared_image | `leeks` | leeks (manual audit hint; exact) |
| `allium_sativum` | plant | Allium Sativum | resolved_by_shared_image | `garlic` | garlic (manual audit hint; exact) |
| `antirrhinum_majus` | plant | Snapdragon | resolved_by_legacy_id | `snapdragon` | snapdragon (name slug; exact) |
| `aspidistra_elatior` | plant | Cast Iron Plant | resolved_by_legacy_id | `cast-iron-plant` | cast-iron-plant (name dash slug; exact) |
| `betula_lenta` | plant | Sweet Birch | resolved_by_legacy_id | `sweet_birch` | sweet_birch (name slug; exact) |
| `calathea_spp` | plant | Calathea | resolved_by_legacy_id | `calathea` | calathea (name slug; exact) |
| `cananga_odorata` | plant | Ylang Ylang | resolved_by_legacy_id | `ylang_ylang` | ylang_ylang (name slug; exact) |
| `crassula_arborescens` | plant | Jade Plant | resolved_by_shared_image | `crassula_arborescens_or_crassula` | crassula_arborescens_or_crassula (manual audit hint; exact) |
| `datura_stramonium` | plant | Jimson Weed | resolved_by_shared_image | `jimson_weed` | jimson_weed (name slug; exact) |
| `dypsis_lutescens` | plant | Areca Palm | resolved_by_legacy_id | `areca-palm` | areca-palm (name dash slug; exact) |
| `e_g_satin_pothos` | plant | Silver Leaf Philodendron | resolved_by_shared_image | `eg_satin_pothos` | eg_satin_pothos (manual audit hint; exact) |
| `eucalyptus_spp` | plant | Eucalyptus | resolved_by_shared_image | `eucalyptus` | eucalyptus (name slug; exact) |
| `eustoma_grandiflorum` | plant | Lisianthus | resolved_by_legacy_id | `lisianthus` | lisianthus (name slug; exact) |
| `gaultheria_procumbens` | plant | Wintergreen | resolved_by_legacy_id | `wintergreen` | wintergreen (name slug; exact) |
| `gerbera_jamesonii` | plant | Gerbera Daisy | resolved_by_legacy_id | `gerbera-daisy` | gerbera-daisy (name dash slug; exact) |
| `helianthus_annuus` | plant | Sunflower | resolved_by_legacy_id | `sunflower` | sunflower (name slug; exact) |
| `hyacinthoides_non_scripta` | plant | Bluebells | resolved_by_shared_image | `hyacinthoides_nonscripta` | hyacinthoides_nonscripta (canonicalId; compact-id) |
| `ilex_spp` | plant | Holly | resolved_by_shared_image | `ilex` | ilex (manual audit hint; exact) |
| `ipomoea_spp` | plant | Morning Glory | resolved_by_legacy_id | `morning_glory` | morning_glory (name slug; exact) |
| `iris_spp` | plant | Iris | resolved_by_shared_image | `iris` | iris (name slug; exact) |
| `scallions_green_onions` | food | Scallions / Green onions | resolved_by_legacy_id | `scallions__green_onions` | scallions__green_onions (name slash slug; exact) |
| `grapes` | food | Grapes | resolved_by_shared_image | `vitis__implied` | vitis__implied (manual audit hint; exact) |
| `raisins` | food | Raisins | resolved_by_shared_image | `vitis__implied` | vitis__implied (manual audit hint; exact) |
| `starfruit` | food | Starfruit | resolved_by_shared_image | `averrhoa_carambola` | averrhoa_carambola (manual audit hint; exact) |
| `raw_eggs_raw_egg_whites` | food | Raw eggs | resolved_by_legacy_id | `raw_eggs__raw_egg_whites` | raw_eggs__raw_egg_whites (scientificName slash slug; exact) |
| `caffeinated_drinks_soda` | food | Caffeinated drinks / Soda | resolved_by_legacy_id | `caffeinated_drinks__soda` | caffeinated_drinks__soda (name slash slug; exact) |
| `candied_fruits` | food | Candied fruits | missing_firestore_image |  | Canonical Firestore doc exists but has no image. |
| `meat_jerky_dried_squid_and_dried_fish` | food | Meat jerky, dried squid, and dried fish | missing_firestore_image |  | Canonical Firestore doc exists but has no image. |
| `pastries_radish_cake_rice_cake_pineapple_cake_mochi` | food | Pastries (radish cake, rice cake, pineapple cake, mochi) | missing_firestore_image |  | Canonical Firestore doc exists but has no image. |

## Duplicate Concept Groups

| Kind | Category | Value | Canonical IDs |
| --- | --- | --- | --- |
| name | plant | eucalyptus | `eucalyptus`<br>`eucalyptus_spp` |
| name | plant | hummingbird mint | `agastache_spp`<br>`hummingbird_mint` |
| name | plant | iris | `iris`<br>`iris_spp` |
| name | plant | jimson weed | `datura_stramonium`<br>`jimson_weed` |

## Draft Registry

Draft registry written to `data/toxin_registry.draft.json`.
All non-canonical image resolutions are marked `needs_review` and should be confirmed before migration.

