using UnityEngine;

namespace Creador2D
{
    /// <summary>
    /// Espejo de la geometria del editor. Es una copia literal de
    /// `creador2d-backend/src/common/domain/tiles.ts`; si cambia alli, cambia
    /// aqui. Un motor que calcule las coordenadas de otra forma ensamblaria el
    /// mundo desplazado respecto a como lo dibujo el usuario.
    /// </summary>
    public static class Creador2DGrid
    {
        // Banderas de la matriz logica de colisiones (un byte por celda).
        public const int FLAG_NONE = 0;
        public const int FLAG_SOLID = 1 << 0;
        public const int FLAG_WATER = 1 << 1;
        public const int FLAG_STAIRS = 1 << 2;
        public const int FLAG_PIT = 1 << 3;
        public const int FLAG_ONE_WAY = 1 << 4;
        public const int FLAG_DAMAGE = 1 << 5;
        public const int FLAG_LADDER = 1 << 6;
        public const int FLAG_TRIGGER = 1 << 7;

        public static readonly string[] LayerOrder = { "GROUND", "PIT", "WALL", "OVERLAY" };

        /// <summary>
        /// Division entera hacia abajo. Mathf.FloorToInt es correcto tambien en
        /// el semieje negativo, a diferencia de la division entera de C#, que
        /// trunca hacia cero y colapsaria los tiles -1 y 0 en el mismo indice.
        /// </summary>
        public static int FloorDiv(int value, int divisor)
        {
            return Mathf.FloorToInt((float)value / divisor);
        }

        public static int FloorMod(int value, int divisor)
        {
            return ((value % divisor) + divisor) % divisor;
        }

        /// <summary>Snapping magnetico: pixel del mundo -> coordenada de tile.</summary>
        public static int PixelToTile(int pixel, int tileSize)
        {
            return FloorDiv(pixel, tileSize);
        }

        public static bool HasFlag(int mask, int flag)
        {
            return (mask & flag) != 0;
        }

        public static bool IsSolid(int mask)
        {
            return HasFlag(mask, FLAG_SOLID);
        }

        /// <summary>
        /// Convierte un tile del editor a posicion de Unity.
        ///
        /// El eje Y del editor crece hacia ABAJO (convencion de pantalla) y el
        /// de Unity hacia ARRIBA, por eso se invierte el signo. La posicion
        /// devuelve el centro del tile en unidades de mundo.
        /// </summary>
        public static Vector3 TileToWorld(int tileX, int tileY, int tileSize, float unitsPerPixel)
        {
            float size = tileSize * unitsPerPixel;
            return new Vector3((tileX + 0.5f) * size, -(tileY + 0.5f) * size, 0f);
        }

        /// <summary>
        /// Orden de dibujado para la ordenacion 2.5D. El ancla es el borde
        /// inferior del elemento, no su centro: asi un actor situado delante de
        /// un muro (mayor Y) se dibuja despues y lo tapa. Se niega para que un
        /// Y mayor produzca un sortingOrder mayor.
        /// </summary>
        public static int SortingOrder(int tileY, int heightInTiles, int ySortOffset, int tileSize)
        {
            return (tileY + heightInTiles) * tileSize + ySortOffset;
        }

        /// <summary>Desplazamiento base por capa, para no mezclar suelo y muros.</summary>
        public static int LayerBaseOrder(string layer)
        {
            switch (layer)
            {
                case "GROUND": return -20000;
                case "PIT": return -10000;
                case "WALL": return 0;
                case "OVERLAY": return 20000;
                default: return 0;
            }
        }

        /// <summary>Convierte "#RRGGBB" en Color; devuelve gris si no es valido.</summary>
        public static Color ParseHexColor(string hex)
        {
            if (!string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out Color parsed))
            {
                return parsed;
            }

            return new Color(0.39f, 0.45f, 0.55f, 1f);
        }
    }
}
