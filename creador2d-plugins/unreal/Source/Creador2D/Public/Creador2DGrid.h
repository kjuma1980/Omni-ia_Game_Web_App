#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "Creador2DGrid.generated.h"

/**
 * Banderas de la matriz logica de colisiones. Un byte por celda, identico al
 * que produce el editor y almacena su base de datos.
 */
UENUM(BlueprintType, meta = (Bitflags))
enum class ECreador2DCollision : uint8
{
    None    = 0      UMETA(DisplayName = "Ninguna"),
    Solid   = 1 << 0 UMETA(DisplayName = "Solido"),
    Water   = 1 << 1 UMETA(DisplayName = "Agua"),
    Stairs  = 1 << 2 UMETA(DisplayName = "Escalones"),
    Pit     = 1 << 3 UMETA(DisplayName = "Foso"),
    OneWay  = 1 << 4 UMETA(DisplayName = "Un sentido"),
    Damage  = 1 << 5 UMETA(DisplayName = "Dano"),
    Ladder  = 1 << 6 UMETA(DisplayName = "Escalera"),
    Trigger = 1 << 7 UMETA(DisplayName = "Disparador"),
};
ENUM_CLASS_FLAGS(ECreador2DCollision);

/**
 * Espejo de la geometria del editor.
 *
 * Copia literal de `creador2d-backend/src/common/domain/tiles.ts`. Si la regla
 * cambia alli, debe cambiar aqui: un motor que calcule las coordenadas de otra
 * forma ensamblaria el mundo desplazado respecto a como lo dibujo el usuario.
 */
UCLASS()
class CREADOR2D_API UCreador2DGrid : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    /**
     * Division entera hacia abajo. FMath::FloorToInt es correcto tambien en el
     * semieje negativo, a diferencia de la division entera de C++, que trunca
     * hacia cero y colapsaria los tiles -1 y 0 en el mismo indice.
     */
    UFUNCTION(BlueprintPure, Category = "Creador2D|Rejilla")
    static int32 FloorDiv(int32 Value, int32 Divisor)
    {
        return FMath::FloorToInt(static_cast<float>(Value) / static_cast<float>(Divisor));
    }

    UFUNCTION(BlueprintPure, Category = "Creador2D|Rejilla")
    static int32 FloorMod(int32 Value, int32 Divisor)
    {
        return ((Value % Divisor) + Divisor) % Divisor;
    }

    /** Snapping magnetico: pixel del mundo -> coordenada de tile. */
    UFUNCTION(BlueprintPure, Category = "Creador2D|Rejilla")
    static int32 PixelToTile(int32 Pixel, int32 TileSize)
    {
        return FloorDiv(Pixel, TileSize);
    }

    UFUNCTION(BlueprintPure, Category = "Creador2D|Colision")
    static bool HasFlag(int32 Mask, ECreador2DCollision Flag)
    {
        return (Mask & static_cast<int32>(Flag)) != 0;
    }

    UFUNCTION(BlueprintPure, Category = "Creador2D|Colision")
    static bool IsSolid(int32 Mask)
    {
        return HasFlag(Mask, ECreador2DCollision::Solid);
    }

    /** Nombres legibles de las banderas activas en una mascara. */
    static TArray<FString> Describe(int32 Mask);

    /**
     * Convierte un tile del editor a posicion de Unreal.
     *
     * Convencion del plugin para escenas 2D/2.5D: X = derecha, Z = arriba,
     * Y = profundidad (una franja por capa, para que el orden de dibujado no
     * dependa del z-fighting). El eje Y del editor crece hacia ABAJO, de ahi el
     * signo negativo en Z.
     */
    static FVector TileToWorld(int32 TileX, int32 TileY, int32 TileSize, float UnitsPerPixel, float DepthY)
    {
        const float Size = TileSize * UnitsPerPixel;
        return FVector(
            (TileX + 0.5f) * Size,
            DepthY,
            -(TileY + 0.5f) * Size);
    }

    /** Profundidad en Y asignada a cada capa, en unidades de Unreal. */
    static float LayerDepth(const FString& Layer)
    {
        if (Layer == TEXT("GROUND")) return 30.0f;
        if (Layer == TEXT("PIT"))    return 20.0f;
        if (Layer == TEXT("WALL"))   return 0.0f;
        if (Layer == TEXT("OVERLAY")) return -20.0f;
        return 0.0f;
    }

    /**
     * Ancla de ordenacion 2.5D: el borde inferior del elemento, no su centro.
     * En Unreal se traduce a un desplazamiento fino en Y para que un actor con
     * mayor tileY quede delante.
     */
    static float SortingDepth(int32 TileY, int32 HeightInTiles, int32 YSortOffset, int32 TileSize)
    {
        return -static_cast<float>((TileY + HeightInTiles) * TileSize + YSortOffset) * 0.001f;
    }

    static const TArray<FString>& LayerOrder();
};
