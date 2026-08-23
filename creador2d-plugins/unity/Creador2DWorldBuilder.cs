using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Creador2D
{
    /// <summary>
    /// Ensambla en la escena el mundo creado en el editor web.
    ///
    /// Instalacion: copie los cuatro ficheros .cs a Assets/Creador2D/, cree un
    /// GameObject vacio y anada este componente. Rellene URL, World ID y token
    /// (los tres se copian del panel "Motores y exportacion" del editor).
    ///
    /// Cada bloque puede tener un prefab propio en `blockPrefabs`. Los que no lo
    /// tengan se generan como un SpriteRenderer de color plano tomado de la
    /// paleta del bloque, de modo que el mundo es visible desde el primer
    /// momento sin necesidad de arte.
    /// </summary>
    public class Creador2DWorldBuilder : MonoBehaviour
    {
        [Header("Conexion")]
        [Tooltip("URL del backend del Creador 2D")]
        public string apiUrl = "http://127.0.0.1:4310";

        [Tooltip("Identificador del mundo (UUID)")]
        public string worldId = "";

        [Tooltip("Token de motor de 12 h generado desde el editor web")]
        public string engineToken = "";

        [Header("Ensamblado")]
        [Tooltip("Unidades de Unity por pixel del editor. 1/32 = un tile de 32 px ocupa 1 unidad.")]
        public float unitsPerPixel = 1f / 32f;

        [Tooltip("Construir automaticamente al iniciar la escena")]
        public bool buildOnStart = true;

        [Tooltip("Generar colliders a partir de la matriz logica")]
        public bool generateColliders = true;

        [Tooltip("Capas que se instancian visualmente")]
        public bool buildGround = true;
        public bool buildPit = true;
        public bool buildWall = true;
        public bool buildOverlay = true;

        [Tooltip("Montar las capas de fondo de parallax incluidas en el mundo")]
        public bool buildParallax = true;

        [Tooltip("Instanciar el mobiliario y adornos de colocacion libre")]
        public bool buildObjects = true;

        /// <summary>Objetos libres instanciados, accesibles desde el juego.</summary>
        public readonly List<GameObject> SpawnedFreeObjects = new List<GameObject>();

        [Header("Prefabs por clave de bloque (opcional)")]
        public List<BlockPrefabBinding> blockPrefabs = new List<BlockPrefabBinding>();

        /// <summary>Matriz descargada; queda accesible para la logica del juego.</summary>
        public WorldMatrix Matrix { get; private set; }

        private Transform _root;
        private readonly Dictionary<string, GameObject> _prefabIndex = new Dictionary<string, GameObject>();

        private void Start()
        {
            if (buildOnStart)
            {
                StartCoroutine(BuildRoutine());
            }
        }

        public void Rebuild()
        {
            StartCoroutine(BuildRoutine());
        }

        public IEnumerator BuildRoutine()
        {
            if (string.IsNullOrEmpty(worldId) || string.IsNullOrEmpty(engineToken))
            {
                Debug.LogError("[Creador2D] Faltan worldId o engineToken.");
                yield break;
            }

            _prefabIndex.Clear();
            foreach (BlockPrefabBinding binding in blockPrefabs)
            {
                if (!string.IsNullOrEmpty(binding.blockKey) && binding.prefab != null)
                {
                    _prefabIndex[binding.blockKey] = binding.prefab;
                }
            }

            var client = new Creador2DClient(apiUrl, engineToken);
            WorldMatrix matrix = null;
            string failure = null;

            yield return client.FetchMatrix(worldId, result => matrix = result, error => failure = error);

            if (matrix == null)
            {
                Debug.LogError($"[Creador2D] No se pudo descargar el mundo: {failure}");
                yield break;
            }

            Matrix = matrix;
            Assemble(matrix);

            Debug.Log($"[Creador2D] Mundo \"{matrix.world.name}\" ensamblado: {matrix.width}x{matrix.height} tiles.");
        }

        private void Assemble(WorldMatrix matrix)
        {
            if (_root != null)
            {
                DestroyImmediate(_root.gameObject);
            }

            // La lista guarda referencias a hijos de _root, que acaba de
            // destruirse: dejarlas produciria "missing reference" al usarlas.
            SpawnedFreeObjects.Clear();

            _root = new GameObject($"Creador2D_{matrix.world.slug}").transform;
            _root.SetParent(transform, false);

            Dictionary<string, BlockInfo> catalog = matrix.BuildCatalog();
            int tileSize = matrix.world.tileSize;

            foreach (string layer in Creador2DGrid.LayerOrder)
            {
                if (!ShouldBuild(layer))
                {
                    continue;
                }

                string[] cells = matrix.layers.Get(layer);
                if (cells == null)
                {
                    continue;
                }

                var layerRoot = new GameObject(layer).transform;
                layerRoot.SetParent(_root, false);

                for (int index = 0; index < cells.Length; index++)
                {
                    string key = cells[index];
                    if (string.IsNullOrEmpty(key))
                    {
                        continue;
                    }

                    int tileX = matrix.origin.tileX + (index % matrix.width);
                    int tileY = matrix.origin.tileY + (index / matrix.width);

                    catalog.TryGetValue(key, out BlockInfo info);
                    SpawnBlock(layerRoot, key, info, layer, tileX, tileY, tileSize);
                }
            }

            if (buildParallax && matrix.parallax != null && matrix.parallax.Length > 0)
            {
                var parallax = GetComponent<Creador2DParallax>();
                if (parallax == null)
                {
                    parallax = gameObject.AddComponent<Creador2DParallax>();
                }
                parallax.Build(matrix.parallax, unitsPerPixel);
            }

            if (buildObjects && matrix.objects != null && matrix.objects.Length > 0)
            {
                SpawnFreeObjects(matrix, catalog, tileSize);
            }

            if (generateColliders)
            {
                BuildColliders(matrix, tileSize);
            }
        }

        /// <summary>
        /// Objetos de colocacion libre. Su posicion llega en pixeles del mundo,
        /// no en celdas, asi que NO se ajusta a la rejilla: es justo lo que los
        /// hace utiles para mobiliario y adornos.
        /// </summary>
        private void SpawnFreeObjects(
            WorldMatrix matrix,
            Dictionary<string, BlockInfo> catalog,
            int tileSize)
        {
            var objectsRoot = new GameObject("Objetos").transform;
            objectsRoot.SetParent(_root, false);

            foreach (PlacedObjectInfo placed in matrix.objects)
            {
                catalog.TryGetValue(placed.blockKey, out BlockInfo info);
                int heightInTiles = info != null ? Mathf.Max(1, info.heightInTiles) : 1;

                // El eje Y del editor crece hacia abajo; el de Unity, hacia arriba.
                var position = new Vector3(
                    placed.x * unitsPerPixel,
                    -placed.y * unitsPerPixel,
                    0f);

                GameObject instance;
                if (_prefabIndex.TryGetValue(placed.blockKey, out GameObject prefab))
                {
                    instance = Instantiate(prefab, position, Quaternion.identity, objectsRoot);
                }
                else
                {
                    instance = BuildFallbackQuad(placed.blockKey, info, tileSize, heightInTiles);
                    instance.transform.SetParent(objectsRoot, false);
                    instance.transform.position = position;
                }

                instance.name = $"{placed.blockKey}_free";
                instance.transform.localRotation = Quaternion.Euler(0f, 0f, -placed.rotation);

                Vector3 scale = instance.transform.localScale * placed.scale;
                if (placed.flipX)
                {
                    scale.x = -scale.x;
                }
                instance.transform.localScale = scale;

                var renderer = instance.GetComponent<SpriteRenderer>();
                if (renderer != null)
                {
                    int tileY = Mathf.FloorToInt(placed.y / tileSize);
                    renderer.sortingOrder =
                        Creador2DGrid.LayerBaseOrder(placed.layer) +
                        Creador2DGrid.SortingOrder(tileY, heightInTiles, placed.zOffset, tileSize);
                }

                SpawnedFreeObjects.Add(instance);
            }
        }

        private bool ShouldBuild(string layer)
        {
            switch (layer)
            {
                case "GROUND": return buildGround;
                case "PIT": return buildPit;
                case "WALL": return buildWall;
                case "OVERLAY": return buildOverlay;
                default: return false;
            }
        }

        private void SpawnBlock(
            Transform parent,
            string key,
            BlockInfo info,
            string layer,
            int tileX,
            int tileY,
            int tileSize)
        {
            int heightInTiles = info != null ? Mathf.Max(1, info.heightInTiles) : 1;
            int ySortOffset = info != null ? info.ySortOffset : 0;

            Vector3 position = Creador2DGrid.TileToWorld(tileX, tileY, tileSize, unitsPerPixel);

            // Los props de mas de un tile de alto crecen hacia arriba desde su
            // celda base, igual que en el editor.
            if (heightInTiles > 1)
            {
                position.y += (heightInTiles - 1) * 0.5f * tileSize * unitsPerPixel;
            }

            GameObject instance;

            if (_prefabIndex.TryGetValue(key, out GameObject prefab))
            {
                instance = Instantiate(prefab, position, Quaternion.identity, parent);
            }
            else
            {
                instance = BuildFallbackQuad(key, info, tileSize, heightInTiles);
                instance.transform.SetParent(parent, false);
                instance.transform.position = position;
            }

            instance.name = $"{key}_{tileX}_{tileY}";

            var renderer = instance.GetComponent<SpriteRenderer>();
            if (renderer != null)
            {
                renderer.sortingOrder =
                    Creador2DGrid.LayerBaseOrder(layer) +
                    Creador2DGrid.SortingOrder(tileY, heightInTiles, ySortOffset, tileSize);
            }
        }

        /// <summary>
        /// Representacion de respaldo: un sprite de 1x1 pixel teñido con el
        /// color base del bloque. Permite ver el mundo sin arte asignado.
        /// </summary>
        private GameObject BuildFallbackQuad(string key, BlockInfo info, int tileSize, int heightInTiles)
        {
            var go = new GameObject(key);
            var renderer = go.AddComponent<SpriteRenderer>();

            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            Color color = info != null && info.visual != null && info.visual.colors != null && info.visual.colors.Length > 0
                ? Creador2DGrid.ParseHexColor(info.visual.colors[0])
                : new Color(0.39f, 0.45f, 0.55f, 1f);

            texture.SetPixel(0, 0, color);
            texture.filterMode = FilterMode.Point;
            texture.Apply();

            renderer.sprite = Sprite.Create(texture, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f), 1f);

            float unit = tileSize * unitsPerPixel;
            go.transform.localScale = new Vector3(unit, unit * heightInTiles, 1f);

            return go;
        }

        /// <summary>
        /// Genera colliders a partir de la matriz logica, no de lo visual.
        ///
        /// Las celdas solidas contiguas de una misma fila se fusionan en un
        /// unico BoxCollider2D: un mundo de 32x32 pasa asi de cientos de
        /// colliders a unas pocas decenas.
        /// </summary>
        private void BuildColliders(WorldMatrix matrix, int tileSize)
        {
            var collidersRoot = new GameObject("Colisiones").transform;
            collidersRoot.SetParent(_root, false);

            float unit = tileSize * unitsPerPixel;

            for (int row = 0; row < matrix.height; row++)
            {
                int runStart = -1;

                for (int column = 0; column <= matrix.width; column++)
                {
                    bool solid = false;

                    if (column < matrix.width)
                    {
                        int mask = matrix.collision[row * matrix.width + column];
                        solid = Creador2DGrid.IsSolid(mask);
                    }

                    if (solid && runStart < 0)
                    {
                        runStart = column;
                    }
                    else if (!solid && runStart >= 0)
                    {
                        int length = column - runStart;
                        int tileX = matrix.origin.tileX + runStart;
                        int tileY = matrix.origin.tileY + row;

                        var go = new GameObject($"Solid_{tileX}_{tileY}_x{length}");
                        go.transform.SetParent(collidersRoot, false);
                        go.transform.position = new Vector3(
                            (tileX + length * 0.5f) * unit,
                            -(tileY + 0.5f) * unit,
                            0f);

                        var box = go.AddComponent<BoxCollider2D>();
                        box.size = new Vector2(length * unit, unit);

                        runStart = -1;
                    }
                }
            }
        }

        /// <summary>Consulta de colision para la logica del juego.</summary>
        public bool IsSolidAt(int tileX, int tileY)
        {
            return Matrix != null && Creador2DGrid.IsSolid(Matrix.CollisionAt(tileX, tileY));
        }

        public int CollisionMaskAt(int tileX, int tileY)
        {
            return Matrix == null ? 0 : Matrix.CollisionAt(tileX, tileY);
        }
    }
}
