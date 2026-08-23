#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Texture2D.h"
#include "Creador2DParallax.generated.h"

/** Una capa de fondo con su factor de desplazamiento. */
USTRUCT(BlueprintType)
struct CREADOR2D_API FCreador2DParallaxLayer
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") FString Kind;
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") FString Name;
    /** 0 = fija a la camara, 1 = anclada al mundo. */
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") float SpeedX = 0.2f;
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") float SpeedY = 0.1f;
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") float Opacity = 1.0f;
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") FLinearColor Tint = FLinearColor::White;
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") bool bRepeatX = true;
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") int32 OffsetY = 0;

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D") UTexture2D* Texture = nullptr;
    UPROPERTY() TArray<UStaticMeshComponent*> Tiles;
    UPROPERTY() float TileWidth = 0.0f;
};

/**
 * Monta las capas de fondo del mundo y las desplaza con la camara.
 *
 * Cada capa se instancia como una fila de planos repetidos que se reciclan por
 * modulo al desplazarse, de modo que el fondo es infinito sin crear objetos en
 * tiempo de ejecucion.
 *
 * La diferencia entre el movimiento de la camara y el de la capa es lo que se
 * percibe como profundidad: con `SpeedX` 0 la capa queda clavada a la pantalla
 * y con 1 se mueve como el propio mundo.
 */
UCLASS(Blueprintable, BlueprintType)
class CREADOR2D_API ACreador2DParallax : public AActor
{
    GENERATED_BODY()

public:
    ACreador2DParallax();

    /** Unidades de Unreal por pixel de la imagen de fondo. */
    UPROPERTY(EditAnywhere, Category = "Creador2D|Parallax")
    float UnitsPerPixel = 3.125f;

    /** Profundidad en Y donde se colocan los fondos, detras del mundo. */
    UPROPERTY(EditAnywhere, Category = "Creador2D|Parallax")
    float BaseDepthY = 200.0f;

    /** Construye las capas a partir del bloque `parallax` del export. */
    void Build(const TArray<TSharedPtr<class FJsonValue>>& ParallaxJson, float InUnitsPerPixel);

    UFUNCTION(BlueprintCallable, Category = "Creador2D|Parallax")
    void ClearLayers();

    virtual void Tick(float DeltaSeconds) override;

    /** Convierte `data:image/png;base64,...` en una textura transitoria. */
    static UTexture2D* DecodeDataUrl(const FString& DataUrl);

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY()
    TArray<FCreador2DParallaxLayer> Layers;

    UPROPERTY()
    USceneComponent* Root = nullptr;

    void BuildLayer(FCreador2DParallaxLayer& Layer, int32 Index);
    static int32 KindOrder(const FString& Kind);
};
