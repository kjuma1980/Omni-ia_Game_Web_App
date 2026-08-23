using System;
using System.Collections.Generic;
using UnityEngine;

namespace Creador2D
{
    /// <summary>
    /// Monta las capas de fondo del mundo y las desplaza con la camara.
    ///
    /// Cada capa se instancia como una fila de sprites repetidos: se crean los
    /// necesarios para cubrir el ancho de la camara mas uno a cada lado, y se
    /// reciclan por modulo al desplazarse. Asi el fondo es infinito sin crear
    /// objetos nuevos en tiempo de ejecucion.
    ///
    /// El factor `speedX` es lo que produce la profundidad: 0 deja la capa
    /// clavada a la pantalla y 1 la ancla al mundo. Los valores intermedios
    /// (0,05 para el cielo, 0,15 para el fondo lejano, 0,4 para el medio) son
    /// los que dan la sensacion de distancia.
    /// </summary>
    [ExecuteAlways]
    public class Creador2DParallax : MonoBehaviour
    {
        [Tooltip("Camara de referencia. Si se deja vacio se usa la principal.")]
        public Camera targetCamera;

        [Tooltip("Unidades de Unity por pixel de la imagen de fondo.")]
        public float unitsPerPixel = 1f / 32f;

        [Tooltip("Orden de dibujado base; las capas se colocan por debajo del mundo.")]
        public int baseSortingOrder = -30000;

        class Layer
        {
            public ParallaxInfo Info;
            public Transform Root;
            public List<Transform> Tiles = new List<Transform>();
            public float TileWidth;
        }

        readonly List<Layer> _layers = new List<Layer>();
        Transform _root;

        /// <summary>Crea las capas a partir del export. Sustituye a las anteriores.</summary>
        public void Build(ParallaxInfo[] parallax, float pixelsPerUnitScale)
        {
            Clear();

            if (parallax == null || parallax.Length == 0)
            {
                return;
            }

            unitsPerPixel = pixelsPerUnitScale;

            if (targetCamera == null)
            {
                targetCamera = Camera.main;
            }

            _root = new GameObject("Parallax").transform;
            _root.SetParent(transform, false);

            // Orden de dibujado: lo mas lejano primero.
            Array.Sort(parallax, (a, b) => KindOrder(a.kind).CompareTo(KindOrder(b.kind)));

            for (int i = 0; i < parallax.Length; i++)
            {
                ParallaxInfo info = parallax[i];
                if (!info.visible || string.IsNullOrEmpty(info.imageUrl))
                {
                    continue;
                }

                Texture2D texture = DecodeDataUrl(info.imageUrl);
                if (texture == null)
                {
                    Debug.LogWarning($"[Creador2D] No se pudo decodificar la capa \"{info.name}\".");
                    continue;
                }

                _layers.Add(BuildLayer(info, texture, i));
            }

            LateUpdate();
        }

        Layer BuildLayer(ParallaxInfo info, Texture2D texture, int index)
        {
            var layer = new Layer { Info = info };

            layer.Root = new GameObject($"{info.kind}_{info.name}").transform;
            layer.Root.SetParent(_root, false);

            var sprite = Sprite.Create(
                texture,
                new Rect(0, 0, texture.width, texture.height),
                new Vector2(0.5f, 0.5f),
                1f / unitsPerPixel);

            layer.TileWidth = texture.width * unitsPerPixel;

            // Cuantas copias hacen falta para cubrir la camara con margen.
            float viewWidth = targetCamera != null
                ? targetCamera.orthographicSize * 2f * targetCamera.aspect
                : 40f;
            int copies = Mathf.Max(3, Mathf.CeilToInt(viewWidth / Mathf.Max(0.01f, layer.TileWidth)) + 2);

            if (!info.repeatX)
            {
                copies = 1;
            }

            Color tint = Creador2DGrid.ParseHexColor(info.tint);
            tint.a = Mathf.Clamp01(info.opacity);

            for (int c = 0; c < copies; c++)
            {
                var go = new GameObject($"tile_{c}");
                go.transform.SetParent(layer.Root, false);

                var renderer = go.AddComponent<SpriteRenderer>();
                renderer.sprite = sprite;
                renderer.color = tint;
                // Cada capa va en su propia franja de orden, siempre detras del
                // mundo, que empieza en LayerBaseOrder("GROUND") = -20000.
                renderer.sortingOrder = baseSortingOrder + index * 10;

                layer.Tiles.Add(go.transform);
            }

            return layer;
        }

        void LateUpdate()
        {
            if (targetCamera == null)
            {
                targetCamera = Camera.main;
                if (targetCamera == null)
                {
                    return;
                }
            }

            Vector3 camPos = targetCamera.transform.position;

            foreach (Layer layer in _layers)
            {
                // La capa sigue a la camara solo en la fraccion indicada: la
                // diferencia entre ambas es lo que se percibe como distancia.
                float x = camPos.x * (1f - layer.Info.speedX);
                float y = camPos.y * (1f - layer.Info.speedY) - layer.Info.offsetY * unitsPerPixel;

                if (layer.TileWidth <= 0.01f || layer.Tiles.Count == 1)
                {
                    layer.Tiles[0].position = new Vector3(x, y, 0f);
                    continue;
                }

                // Ancla al multiplo de tile mas cercano para que el reciclado no
                // deje huecos al cruzar de una copia a la siguiente.
                float anchor = Mathf.Floor((camPos.x - x) / layer.TileWidth) * layer.TileWidth;

                for (int i = 0; i < layer.Tiles.Count; i++)
                {
                    float offset = anchor + (i - layer.Tiles.Count / 2) * layer.TileWidth;
                    layer.Tiles[i].position = new Vector3(x + offset, y, 0f);
                }
            }
        }

        public void Clear()
        {
            _layers.Clear();

            if (_root != null)
            {
                if (Application.isPlaying)
                {
                    Destroy(_root.gameObject);
                }
                else
                {
                    DestroyImmediate(_root.gameObject);
                }
                _root = null;
            }
        }

        static int KindOrder(string kind)
        {
            switch (kind)
            {
                case "SKY": return 0;
                case "FAR": return 1;
                case "MID": return 2;
                case "NEAR": return 3;
                default: return 2;
            }
        }

        /// <summary>Convierte `data:image/png;base64,...` en una textura.</summary>
        public static Texture2D DecodeDataUrl(string dataUrl)
        {
            if (string.IsNullOrEmpty(dataUrl))
            {
                return null;
            }

            int comma = dataUrl.IndexOf(',');
            string payload = comma >= 0 ? dataUrl.Substring(comma + 1) : dataUrl;

            try
            {
                byte[] bytes = Convert.FromBase64String(payload);
                var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);

                if (!texture.LoadImage(bytes))
                {
                    return null;
                }

                // Sin repeticion en el borde el muestreo bilineal mezcla la
                // ultima columna con la primera y aparece una linea fina.
                texture.wrapMode = TextureWrapMode.Repeat;
                texture.filterMode = FilterMode.Bilinear;
                return texture;
            }
            catch (FormatException)
            {
                return null;
            }
        }
    }
}
