using System;
using System.Collections.Generic;
using UnityEngine;

namespace Creador2D
{
    /// <summary>
    /// Contratos de datos del formato "creador2d.matrix.v1".
    ///
    /// Todas las clases son [Serializable] con campos publicos porque
    /// JsonUtility de Unity solo deserializa asi. Los nombres coinciden
    /// exactamente con las claves JSON que emite la API.
    /// </summary>
    [Serializable]
    public class WorldInfo
    {
        public string id;
        public string slug;
        public string name;
        public string type;
        public int tileSize;
        public int chunkSize;
        public string biome;
        public int seed;
        public string background;
        public float gravity;
        public int version;
    }

    [Serializable]
    public class BlockVisual
    {
        public string pattern;
        public string[] colors;
        public string accent;
        public float detail;
    }

    [Serializable]
    public class BlockInfo
    {
        public string key;
        public string name;
        public string layer;
        public int collisionFlags;
        public int heightInTiles;
        public int ySortOffset;
        public BlockVisual visual;
    }

    [Serializable]
    public class MatrixOrigin
    {
        public int tileX;
        public int tileY;
    }

    /// <summary>
    /// Las cuatro capas llegan como un objeto de claves fijas, no como un
    /// diccionario, precisamente para que JsonUtility pueda mapearlas.
    /// </summary>
    [Serializable]
    public class MatrixLayers
    {
        public string[] GROUND;
        public string[] PIT;
        public string[] WALL;
        public string[] OVERLAY;

        public string[] Get(string layer)
        {
            switch (layer)
            {
                case "GROUND": return GROUND;
                case "PIT": return PIT;
                case "WALL": return WALL;
                case "OVERLAY": return OVERLAY;
                default: return null;
            }
        }
    }

    /// <summary>
    /// Capa de fondo. `imageUrl` llega como data URL con el PNG incrustado, de
    /// modo que el mundo es autocontenido y no depende de ningun servidor.
    /// </summary>
    [Serializable]
    public class ParallaxInfo
    {
        public string kind;
        public int order;
        public string name;
        public string imageUrl;
        /// <summary>0 = fija a la camara, 1 = anclada al mundo.</summary>
        public float speedX;
        public float speedY;
        public float opacity;
        public string tint;
        public bool repeatX;
        public bool repeatY;
        public int offsetY;
        public bool visible;
    }

    /// <summary>Objeto de colocacion libre: posicion continua, no por celdas.</summary>
    [Serializable]
    public class PlacedObjectInfo
    {
        public string blockKey;
        public float x;
        public float y;
        public float rotation;
        public float scale;
        public bool flipX;
        public string layer;
        public int zOffset;
    }

    [Serializable]
    public class WeatherInfo
    {
        public string type;
        public float intensity;
        public string windDirection;
        public float windStrength;
        public float fogDensity;
        public string tint;
        public int emissionRate;
    }

    [Serializable]
    public class FluidInfo
    {
        public string blockKey;
        public string flow;
        public float speed;
        public float waveHeight;
        public bool bubbles;
        public int bubbleRate;
    }

    /// <summary>Interior enlazado y la celda del exterior por la que se entra.</summary>
    [Serializable]
    public class InteriorInfo
    {
        public string id;
        public string slug;
        public string name;
        public int entranceTileX;
        public int entranceTileY;
    }

    [Serializable]
    public class WorldMatrix
    {
        public string format;
        public string generatedAt;
        public WorldInfo world;
        public BlockInfo[] blocks;
        public ParallaxInfo[] parallax;
        public PlacedObjectInfo[] objects;
        public WeatherInfo weather;
        public FluidInfo[] fluids;
        public InteriorInfo[] interiors;
        public MatrixOrigin origin;
        public int width;
        public int height;
        public MatrixLayers layers;
        public int[] collision;

        /// <summary>Indice lineal de un tile absoluto, o -1 si cae fuera.</summary>
        public int IndexOf(int tileX, int tileY)
        {
            int localX = tileX - origin.tileX;
            int localY = tileY - origin.tileY;

            if (localX < 0 || localY < 0 || localX >= width || localY >= height)
            {
                return -1;
            }

            return localY * width + localX;
        }

        public int CollisionAt(int tileX, int tileY)
        {
            int index = IndexOf(tileX, tileY);
            return index < 0 ? 0 : collision[index];
        }

        public string BlockAt(string layer, int tileX, int tileY)
        {
            int index = IndexOf(tileX, tileY);
            if (index < 0)
            {
                return string.Empty;
            }

            string[] cells = layers.Get(layer);
            return cells == null ? string.Empty : cells[index];
        }

        public Dictionary<string, BlockInfo> BuildCatalog()
        {
            var catalog = new Dictionary<string, BlockInfo>();
            if (blocks == null)
            {
                return catalog;
            }

            foreach (BlockInfo block in blocks)
            {
                catalog[block.key] = block;
            }

            return catalog;
        }
    }

    /// <summary>Asociacion entre una clave de bloque y el prefab del proyecto.</summary>
    [Serializable]
    public class BlockPrefabBinding
    {
        public string blockKey;
        public GameObject prefab;
    }
}
