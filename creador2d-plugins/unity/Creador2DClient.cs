using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

namespace Creador2D
{
    /// <summary>
    /// Cliente HTTP del Creador 2D para Unity.
    ///
    /// Usa el token de servicio que genera el editor web (panel "Motores y
    /// exportacion"). Ese token es de SOLO LECTURA y caduca a las 12 horas: el
    /// motor nunca maneja la clave del usuario ni puede escribir en el mundo.
    /// </summary>
    public class Creador2DClient
    {
        private readonly string _baseUrl;
        private readonly string _token;

        public Creador2DClient(string baseUrl, string token)
        {
            _baseUrl = (baseUrl ?? string.Empty).TrimEnd('/');
            _token = token ?? string.Empty;
        }

        /// <summary>Comprueba que el servicio responde antes de descargar nada.</summary>
        public IEnumerator CheckHealth(Action<bool, string> onResult)
        {
            using (UnityWebRequest request = UnityWebRequest.Get($"{_baseUrl}/api/health"))
            {
                request.timeout = 10;
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    onResult(false, request.error);
                    yield break;
                }

                onResult(true, request.downloadHandler.text);
            }
        }

        /// <summary>
        /// Descarga la matriz absoluta del mundo. Es el formato mas comodo para
        /// un motor: una rejilla rectangular ya ensamblada, sin tener que
        /// reconstruir los chunks.
        /// </summary>
        public IEnumerator FetchMatrix(string worldId, Action<WorldMatrix> onSuccess, Action<string> onError)
        {
            string url = $"{_baseUrl}/api/worlds/{worldId}/export/matrix";

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                request.SetRequestHeader("Authorization", $"Bearer {_token}");
                request.timeout = 60;

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    onError($"HTTP {request.responseCode}: {request.error}");
                    yield break;
                }

                WorldMatrix matrix;
                try
                {
                    matrix = JsonUtility.FromJson<WorldMatrix>(request.downloadHandler.text);
                }
                catch (Exception exception)
                {
                    onError($"No se pudo interpretar la respuesta: {exception.Message}");
                    yield break;
                }

                if (matrix == null || matrix.format != "creador2d.matrix.v1")
                {
                    onError("La respuesta no tiene el formato creador2d.matrix.v1");
                    yield break;
                }

                onSuccess(matrix);
            }
        }

        /// <summary>
        /// Descarga unicamente la matriz de colisiones. Util para builds de
        /// servidor o para recargar la fisica sin volver a traer lo visual.
        /// </summary>
        public IEnumerator FetchCollision(string worldId, Action<int[], int, int, MatrixOrigin> onSuccess, Action<string> onError)
        {
            string url = $"{_baseUrl}/api/worlds/{worldId}/export/collision";

            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                request.SetRequestHeader("Authorization", $"Bearer {_token}");
                request.timeout = 60;

                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    onError($"HTTP {request.responseCode}: {request.error}");
                    yield break;
                }

                CollisionExport export = JsonUtility.FromJson<CollisionExport>(request.downloadHandler.text);
                if (export == null || export.collision == null)
                {
                    onError("Respuesta de colisiones vacia");
                    yield break;
                }

                onSuccess(export.collision, export.width, export.height, export.origin);
            }
        }

        [Serializable]
        private class CollisionExport
        {
            public string format;
            public string worldId;
            public int tileSize;
            public MatrixOrigin origin;
            public int width;
            public int height;
            public int[] collision;
        }
    }
}
