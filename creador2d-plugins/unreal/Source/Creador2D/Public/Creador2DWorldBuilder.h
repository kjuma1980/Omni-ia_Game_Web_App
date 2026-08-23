#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interfaces/IHttpRequest.h"
#include "Creador2DGrid.h"
#include "Creador2DWorldBuilder.generated.h"

/** Definicion de un bloque tal y como la publica la API. */
USTRUCT(BlueprintType)
struct CREADOR2D_API FCreador2DBlockInfo
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    FString Key;

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    FString Name;

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    FString Layer;

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    int32 CollisionFlags = 0;

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    int32 HeightInTiles = 1;

    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    int32 YSortOffset = 0;

    /** Color base del bloque, usado cuando no hay actor asignado. */
    UPROPERTY(BlueprintReadOnly, Category = "Creador2D")
    FLinearColor PrimaryColor = FLinearColor(0.39f, 0.45f, 0.55f, 1.0f);
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FCreador2DBuildFinished, bool, bSuccess);

/**
 * Descarga un mundo del Creador 2D y lo ensambla en el nivel.
 *
 * Instalacion: copie la carpeta `unreal` a `<Proyecto>/Plugins/Creador2D`,
 * regenere los archivos de proyecto y compile. Despues arrastre este actor al
 * nivel y rellene URL, World ID y token (los tres se copian del panel "Motores
 * y exportacion" del editor web).
 *
 * El token es de SOLO LECTURA y caduca a las 12 horas: el motor nunca maneja la
 * clave del usuario ni puede escribir en el mundo.
 */
UCLASS(Blueprintable, BlueprintType)
class CREADOR2D_API ACreador2DWorldBuilder : public AActor
{
    GENERATED_BODY()

public:
    ACreador2DWorldBuilder();

    // ------------------------------ Conexion --------------------------------

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Conexion")
    FString ApiUrl = TEXT("http://127.0.0.1:4310");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Conexion")
    FString WorldId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Conexion")
    FString EngineToken;

    // ----------------------------- Ensamblado -------------------------------

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    bool bBuildOnBeginPlay = true;

    /** Unidades de Unreal por pixel del editor. 3.125 => un tile de 32 px = 100 uu. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    float UnitsPerPixel = 3.125f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    bool bGenerateCollision = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    bool bSpawnVisuals = true;

    /** Montar las capas de fondo de parallax incluidas en el mundo. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    bool bBuildParallax = true;

    /** Instanciar el mobiliario y adornos de colocacion libre. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    bool bBuildObjects = true;

    /** Actor a instanciar por clave de bloque. Lo que no este aqui usa un cubo teñido. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Creador2D|Ensamblado")
    TMap<FString, TSubclassOf<AActor>> BlockActorClasses;

    UPROPERTY(BlueprintAssignable, Category = "Creador2D")
    FCreador2DBuildFinished OnBuildFinished;

    // ------------------------------ Operacion -------------------------------

    /** Lanza la descarga y el ensamblado. */
    UFUNCTION(BlueprintCallable, Category = "Creador2D")
    void BuildWorld();

    /** Elimina del nivel todo lo generado por este actor. */
    UFUNCTION(BlueprintCallable, Category = "Creador2D")
    void ClearWorld();

    UFUNCTION(BlueprintPure, Category = "Creador2D|Colision")
    int32 GetCollisionMaskAt(int32 TileX, int32 TileY) const;

    UFUNCTION(BlueprintPure, Category = "Creador2D|Colision")
    bool IsSolidAt(int32 TileX, int32 TileY) const;

    UFUNCTION(BlueprintPure, Category = "Creador2D")
    FString GetBlockKeyAt(const FString& Layer, int32 TileX, int32 TileY) const;

    UFUNCTION(BlueprintPure, Category = "Creador2D")
    bool IsWorldLoaded() const { return bLoaded; }

protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    void HandleResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnectedSuccessfully);
    bool ParseMatrix(const FString& Json);
    void Assemble();
    void BuildCollisionBoxes();
    void SpawnBlock(const FString& Key, const FString& Layer, int32 TileX, int32 TileY);
    AActor* SpawnFallbackActor(const FCreador2DBlockInfo& Info, const FVector& Location, int32 HeightInTiles);
    int32 LinearIndex(int32 TileX, int32 TileY) const;

    // --- Estado del mundo descargado ---
    bool bLoaded = false;
    FString WorldName;
    FString WorldSlug;
    int32 TileSize = 32;
    int32 MatrixWidth = 0;
    int32 MatrixHeight = 0;
    int32 OriginTileX = 0;
    int32 OriginTileY = 0;

    TArray<int32> CollisionMatrix;
    TMap<FString, TArray<FString>> LayerCells;
    TMap<FString, FCreador2DBlockInfo> Catalog;

    /** Bloque `parallax` del export, sin interpretar: lo consume el actor de fondo. */
    TArray<TSharedPtr<class FJsonValue>> ParallaxJson;

    /** Objetos de colocacion libre leidos del export. */
    struct FFreeObject
    {
        FString BlockKey;
        float X = 0.0f;
        float Y = 0.0f;
        float Rotation = 0.0f;
        float Scale = 1.0f;
        bool bFlipX = false;
        FString Layer;
        int32 ZOffset = 0;
    };
    TArray<FFreeObject> FreeObjects;

    UPROPERTY()
    class ACreador2DParallax* ParallaxActor = nullptr;

    void SpawnFreeObjects();

    UPROPERTY()
    TArray<AActor*> SpawnedActors;

    UPROPERTY()
    TArray<UBoxComponent*> CollisionBoxes;
};
