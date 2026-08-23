#include "Modules/ModuleManager.h"

/**
 * Modulo de runtime del plugin Creador 2D.
 *
 * No necesita inicializacion propia: toda la funcionalidad vive en el actor
 * ACreador2DWorldBuilder, que se anade a la escena como cualquier otro.
 */
IMPLEMENT_MODULE(FDefaultModuleImpl, Creador2D);
