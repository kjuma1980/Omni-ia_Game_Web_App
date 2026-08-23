#include "Creador2DWorldBuilder.h"
#include "Creador2DParallax.h"

#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/ConstructorHelpers.h"

DEFINE_LOG_CATEGORY_STATIC(LogCreador2D, Log, All);

ACreador2DWorldBuilder::ACreador2DWorldBuilder()
{
    PrimaryActorTick.bCanEverTick = false;
    RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

void ACreador2DWorldBuilder::BeginPlay()
{
    Super::BeginPlay();

    if (bBuildOnBeginPlay)
    {
        BuildWorld();
    }
}

void ACreador2DWorldBuilder::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    ClearWorld();
    Super::EndPlay(EndPlayReason);
}

void ACreador2DWorldBuilder::BuildWorld()
{
    if (WorldId.IsEmpty() || EngineToken.IsEmpty())
    {
        UE_LOG(LogCreador2D, Error, TEXT("Faltan WorldId o EngineToken."));
        OnBuildFinished.Broadcast(false);
        return;
    }

    FString Base = ApiUrl;
    Base.RemoveFromEnd(TEXT("/"));

    const FString Url = FString::Printf(TEXT("%s/api/worlds/%s/export/matrix"), *Base, *WorldId);

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *EngineToken));
    Request->SetHeader(TEXT("Accept"), TEXT("application/json"));
    Request->SetTimeout(60.0f);
    Request->OnProcessRequestComplete().BindUObject(this, &ACreador2DWorldBuilder::HandleResponse);
    Request->ProcessRequest();

    UE_LOG(LogCreador2D, Log, TEXT("Descargando mundo desde %s"), *Url);
}

void ACreador2DWorldBuilder::HandleResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnectedSuccessfully)
{
    if (!bConnectedSuccessfully || !Response.IsValid())
    {
        UE_LOG(LogCreador2D, Error, TEXT("No se pudo contactar con la API del Creador 2D."));
        OnBuildFinished.Broadcast(false);
        return;
    }

    const int32 Code = Response->GetResponseCode();
    if (Code < 200 || Code >= 300)
    {
        UE_LOG(LogCreador2D, Error, TEXT("La API devolvio HTTP %d: %s"), Code, *Response->GetContentAsString());
        OnBuildFinished.Broadcast(false);
        return;
    }

    if (!ParseMatrix(Response->GetContentAsString()))
    {
        OnBuildFinished.Broadcast(false);
        return;
    }

    Assemble();
    OnBuildFinished.Broadcast(true);
}

bool ACreador2DWorldBuilder::ParseMatrix(const FString& Json)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);

    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        UE_LOG(LogCreador2D, Error, TEXT("La respuesta no es JSON valido."));
        return false;
    }

    if (Root->GetStringField(TEXT("format")) != TEXT("creador2d.matrix.v1"))
    {
        UE_LOG(LogCreador2D, Error, TEXT("Formato inesperado; se esperaba creador2d.matrix.v1."));
        return false;
    }

    // --- Cabecera del mundo -------------------------------------------------
    const TSharedPtr<FJsonObject>* WorldObject = nullptr;
    if (Root->TryGetObjectField(TEXT("world"), WorldObject) && WorldObject)
    {
        WorldName = (*WorldObject)->GetStringField(TEXT("name"));
        WorldSlug = (*WorldObject)->GetStringField(TEXT("slug"));
        TileSize = (*WorldObject)->GetIntegerField(TEXT("tileSize"));
    }

    MatrixWidth = Root->GetIntegerField(TEXT("width"));
    MatrixHeight = Root->GetIntegerField(TEXT("height"));

    const TSharedPtr<FJsonObject>* OriginObject = nullptr;
    if (Root->TryGetObjectField(TEXT("origin"), OriginObject) && OriginObject)
    {
        OriginTileX = (*OriginObject)->GetIntegerField(TEXT("tileX"));
        OriginTileY = (*OriginObject)->GetIntegerField(TEXT("tileY"));
    }

    // --- Catalogo de bloques ------------------------------------------------
    Catalog.Empty();
    const TArray<TSharedPtr<FJsonValue>>* BlocksArray = nullptr;
    if (Root->TryGetArrayField(TEXT("blocks"), BlocksArray) && BlocksArray)
    {
        for (const TSharedPtr<FJsonValue>& Value : *BlocksArray)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid())
            {
                continue;
            }

            FCreador2DBlockInfo Info;
            Info.Key = Object->GetStringField(TEXT("key"));
            Info.Name = Object->GetStringField(TEXT("name"));
            Info.Layer = Object->GetStringField(TEXT("layer"));
            Object->TryGetNumberField(TEXT("collisionFlags"), Info.CollisionFlags);
            Object->TryGetNumberField(TEXT("heightInTiles"), Info.HeightInTiles);
            Object->TryGetNumberField(TEXT("ySortOffset"), Info.YSortOffset);

            // El color base sirve de respaldo visual cuando el bloque no tiene
            // un actor asignado en el proyecto.
            const TSharedPtr<FJsonObject>* VisualObject = nullptr;
            if (Object->TryGetObjectField(TEXT("visual"), VisualObject) && VisualObject)
            {
                const TArray<TSharedPtr<FJsonValue>>* Colors = nullptr;
                if ((*VisualObject)->TryGetArrayField(TEXT("colors"), Colors) && Colors && Colors->Num() > 0)
                {
                    Info.PrimaryColor = FLinearColor::FromSRGBColor(
                        FColor::FromHex((*Colors)[0]->AsString()));
                }
            }

            Catalog.Add(Info.Key, Info);
        }
    }

    // --- Capas visuales -----------------------------------------------------
    LayerCells.Empty();
    const TSharedPtr<FJsonObject>* LayersObject = nullptr;
    if (Root->TryGetObjectField(TEXT("layers"), LayersObject) && LayersObject)
    {
        for (const FString& Layer : UCreador2DGrid::LayerOrder())
        {
            const TArray<TSharedPtr<FJsonValue>>* Cells = nullptr;
            if (!(*LayersObject)->TryGetArrayField(Layer, Cells) || !Cells)
            {
                continue;
            }

            TArray<FString> Keys;
            Keys.Reserve(Cells->Num());
            for (const TSharedPtr<FJsonValue>& Cell : *Cells)
            {
                Keys.Add(Cell->AsString());
            }

            LayerCells.Add(Layer, MoveTemp(Keys));
        }
    }

    // --- Capas de parallax --------------------------------------------------
    // Se guardan sin interpretar: quien las entiende es ACreador2DParallax.
    ParallaxJson.Empty();
    const TArray<TSharedPtr<FJsonValue>>* ParallaxArray = nullptr;
    if (Root->TryGetArrayField(TEXT("parallax"), ParallaxArray) && ParallaxArray)
    {
        ParallaxJson = *ParallaxArray;
    }

    // --- Objetos de colocacion libre ---------------------------------------
    FreeObjects.Empty();
    const TArray<TSharedPtr<FJsonValue>>* ObjectsArray = nullptr;
    if (Root->TryGetArrayField(TEXT("objects"), ObjectsArray) && ObjectsArray)
    {
        for (const TSharedPtr<FJsonValue>& Value : *ObjectsArray)
        {
            const TSharedPtr<FJsonObject> Object = Value->AsObject();
            if (!Object.IsValid())
            {
                continue;
            }

            FFreeObject Free;
            Free.BlockKey = Object->GetStringField(TEXT("blockKey"));
            Object->TryGetNumberField(TEXT("x"), Free.X);
            Object->TryGetNumberField(TEXT("y"), Free.Y);
            Object->TryGetNumberField(TEXT("rotation"), Free.Rotation);
            Object->TryGetNumberField(TEXT("scale"), Free.Scale);
            Object->TryGetBoolField(TEXT("flipX"), Free.bFlipX);
            Object->TryGetStringField(TEXT("layer"), Free.Layer);
            Object->TryGetNumberField(TEXT("zOffset"), Free.ZOffset);

            FreeObjects.Add(Free);
        }
    }

    // --- Matriz logica de colisiones ---------------------------------------
    CollisionMatrix.Empty();
    const TArray<TSharedPtr<FJsonValue>>* CollisionArray = nullptr;
    if (Root->TryGetArrayField(TEXT("collision"), CollisionArray) && CollisionArray)
    {
        CollisionMatrix.Reserve(CollisionArray->Num());
        for (const TSharedPtr<FJsonValue>& Value : *CollisionArray)
        {
            CollisionMatrix.Add(static_cast<int32>(Value->AsNumber()));
        }
    }

    bLoaded = true;

    UE_LOG(LogCreador2D, Log, TEXT("Mundo \"%s\" descargado: %dx%d tiles, %d bloques en catalogo."),
        *WorldName, MatrixWidth, MatrixHeight, Catalog.Num());

    return true;
}

void ACreador2DWorldBuilder::Assemble()
{
    ClearWorld();

    if (bSpawnVisuals)
    {
        for (const FString& Layer : UCreador2DGrid::LayerOrder())
        {
            const TArray<FString>* Cells = LayerCells.Find(Layer);
            if (!Cells)
            {
                continue;
            }

            for (int32 Index = 0; Index < Cells->Num(); ++Index)
            {
                const FString& Key = (*Cells)[Index];
                if (Key.IsEmpty())
                {
                    continue;
                }

                const int32 TileX = OriginTileX + (Index % MatrixWidth);
                const int32 TileY = OriginTileY + (Index / MatrixWidth);
                SpawnBlock(Key, Layer, TileX, TileY);
            }
        }
    }

    if (bBuildParallax && ParallaxJson.Num() > 0)
    {
        FActorSpawnParameters Params;
        Params.Owner = this;
        ParallaxActor = GetWorld()->SpawnActor<ACreador2DParallax>(
            ACreador2DParallax::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);

        if (ParallaxActor)
        {
            ParallaxActor->Build(ParallaxJson, UnitsPerPixel);
        }
    }

    if (bBuildObjects && FreeObjects.Num() > 0)
    {
        SpawnFreeObjects();
    }

    if (bGenerateCollision)
    {
        BuildCollisionBoxes();
    }

    UE_LOG(LogCreador2D, Log, TEXT("Ensamblado completo: %d actores, %d cajas de colision, %d objetos libres."),
        SpawnedActors.Num(), CollisionBoxes.Num(), FreeObjects.Num());
}

/**
 * Objetos de colocacion libre. Su posicion llega en pixeles del mundo, no en
 * celdas, asi que NO se ajusta a la rejilla: es justo lo que los hace utiles
 * para mobiliario y adornos.
 */
void ACreador2DWorldBuilder::SpawnFreeObjects()
{
    const float Unit = UnitsPerPixel;

    for (const FFreeObject& Free : FreeObjects)
    {
        const FCreador2DBlockInfo* Info = Catalog.Find(Free.BlockKey);
        const int32 HeightInTiles = Info ? FMath::Max(1, Info->HeightInTiles) : 1;

        const float Depth = UCreador2DGrid::LayerDepth(Free.Layer)
            + UCreador2DGrid::SortingDepth(
                FMath::FloorToInt(Free.Y / TileSize), HeightInTiles, Free.ZOffset, TileSize);

        // X a la derecha, Z arriba: el eje Y del editor crece hacia abajo.
        const FVector Location(Free.X * Unit, Depth, -Free.Y * Unit);

        AActor* Spawned = nullptr;

        if (const TSubclassOf<AActor>* ActorClass = BlockActorClasses.Find(Free.BlockKey))
        {
            if (*ActorClass)
            {
                FActorSpawnParameters Params;
                Params.Owner = this;
                Spawned = GetWorld()->SpawnActor<AActor>(
                    *ActorClass, Location, FRotator(0.0f, 0.0f, -Free.Rotation), Params);
            }
        }

        if (!Spawned && Info)
        {
            Spawned = SpawnFallbackActor(*Info, Location, HeightInTiles);
        }

        if (!Spawned)
        {
            continue;
        }

        FVector Scale = Spawned->GetActorScale3D() * Free.Scale;
        if (Free.bFlipX)
        {
            Scale.X = -Scale.X;
        }
        Spawned->SetActorScale3D(Scale);
        Spawned->SetActorLabel(FString::Printf(TEXT("%s_free"), *Free.BlockKey));
        Spawned->AttachToActor(this, FAttachmentTransformRules::KeepWorldTransform);

        SpawnedActors.Add(Spawned);
    }
}

void ACreador2DWorldBuilder::SpawnBlock(const FString& Key, const FString& Layer, int32 TileX, int32 TileY)
{
    const FCreador2DBlockInfo* Info = Catalog.Find(Key);
    const int32 HeightInTiles = Info ? FMath::Max(1, Info->HeightInTiles) : 1;
    const int32 YSortOffset = Info ? Info->YSortOffset : 0;

    const float Depth = UCreador2DGrid::LayerDepth(Layer)
        + UCreador2DGrid::SortingDepth(TileY, HeightInTiles, YSortOffset, TileSize);

    FVector Location = UCreador2DGrid::TileToWorld(TileX, TileY, TileSize, UnitsPerPixel, Depth);

    // Los props de mas de un tile de alto crecen hacia arriba desde su celda
    // base, igual que en el editor.
    if (HeightInTiles > 1)
    {
        Location.Z += (HeightInTiles - 1) * 0.5f * TileSize * UnitsPerPixel;
    }

    AActor* Spawned = nullptr;

    if (const TSubclassOf<AActor>* ActorClass = BlockActorClasses.Find(Key))
    {
        if (*ActorClass)
        {
            FActorSpawnParameters Params;
            Params.Owner = this;
            Spawned = GetWorld()->SpawnActor<AActor>(*ActorClass, Location, FRotator::ZeroRotator, Params);
        }
    }

    if (!Spawned && Info)
    {
        Spawned = SpawnFallbackActor(*Info, Location, HeightInTiles);
    }

    if (Spawned)
    {
        Spawned->SetActorLabel(FString::Printf(TEXT("%s_%d_%d"), *Key, TileX, TileY));
        Spawned->AttachToActor(this, FAttachmentTransformRules::KeepWorldTransform);
        SpawnedActors.Add(Spawned);
    }
}

/**
 * Representacion de respaldo: un cubo basico del motor teñido con el color base
 * del bloque. Permite ver el mundo sin necesidad de arte propio.
 */
AActor* ACreador2DWorldBuilder::SpawnFallbackActor(const FCreador2DBlockInfo& Info, const FVector& Location, int32 HeightInTiles)
{
    UStaticMesh* CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    if (!CubeMesh)
    {
        return nullptr;
    }

    FActorSpawnParameters Params;
    Params.Owner = this;

    AStaticMeshActor* Actor = GetWorld()->SpawnActor<AStaticMeshActor>(
        AStaticMeshActor::StaticClass(), Location, FRotator::ZeroRotator, Params);

    if (!Actor)
    {
        return nullptr;
    }

    Actor->SetMobility(EComponentMobility::Movable);

    UStaticMeshComponent* Mesh = Actor->GetStaticMeshComponent();
    Mesh->SetStaticMesh(CubeMesh);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    // El cubo del motor mide 100 uu; se escala al tamano del tile. El grosor en
    // Y se mantiene fino para que la escena siga leyendose como 2D.
    const float Unit = TileSize * UnitsPerPixel;
    Mesh->SetWorldScale3D(FVector(Unit / 100.0f, 0.05f, Unit * HeightInTiles / 100.0f));

    UMaterialInterface* BaseMaterial = LoadObject<UMaterialInterface>(
        nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));

    if (BaseMaterial)
    {
        UMaterialInstanceDynamic* Dynamic = UMaterialInstanceDynamic::Create(BaseMaterial, Actor);
        Dynamic->SetVectorParameterValue(TEXT("Color"), Info.PrimaryColor);
        Mesh->SetMaterial(0, Dynamic);
    }

    return Actor;
}

/**
 * Genera la colision a partir de la matriz logica, no de lo visual.
 *
 * Las celdas solidas contiguas de una misma fila se fusionan en una unica caja:
 * un mundo de 32x32 pasa de cientos de componentes a unas pocas decenas.
 */
void ACreador2DWorldBuilder::BuildCollisionBoxes()
{
    const float Unit = TileSize * UnitsPerPixel;

    for (int32 Row = 0; Row < MatrixHeight; ++Row)
    {
        int32 RunStart = -1;

        for (int32 Column = 0; Column <= MatrixWidth; ++Column)
        {
            bool bSolid = false;

            if (Column < MatrixWidth)
            {
                const int32 Index = Row * MatrixWidth + Column;
                bSolid = CollisionMatrix.IsValidIndex(Index) && UCreador2DGrid::IsSolid(CollisionMatrix[Index]);
            }

            if (bSolid && RunStart < 0)
            {
                RunStart = Column;
            }
            else if (!bSolid && RunStart >= 0)
            {
                const int32 Length = Column - RunStart;
                const int32 TileX = OriginTileX + RunStart;
                const int32 TileY = OriginTileY + Row;

                UBoxComponent* Box = NewObject<UBoxComponent>(this);
                Box->SetupAttachment(RootComponent);
                Box->RegisterComponent();
                Box->SetBoxExtent(FVector(Length * Unit * 0.5f, Unit * 0.5f, Unit * 0.5f));
                Box->SetWorldLocation(FVector(
                    (TileX + Length * 0.5f) * Unit,
                    0.0f,
                    -(TileY + 0.5f) * Unit));
                Box->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
                Box->SetCollisionObjectType(ECC_WorldStatic);
                Box->SetCollisionResponseToAllChannels(ECR_Block);

                CollisionBoxes.Add(Box);
                RunStart = -1;
            }
        }
    }
}

void ACreador2DWorldBuilder::ClearWorld()
{
    for (AActor* Actor : SpawnedActors)
    {
        if (IsValid(Actor))
        {
            Actor->Destroy();
        }
    }
    SpawnedActors.Empty();

    for (UBoxComponent* Box : CollisionBoxes)
    {
        if (IsValid(Box))
        {
            Box->DestroyComponent();
        }
    }
    CollisionBoxes.Empty();
}

int32 ACreador2DWorldBuilder::LinearIndex(int32 TileX, int32 TileY) const
{
    const int32 LocalX = TileX - OriginTileX;
    const int32 LocalY = TileY - OriginTileY;

    if (LocalX < 0 || LocalY < 0 || LocalX >= MatrixWidth || LocalY >= MatrixHeight)
    {
        return INDEX_NONE;
    }

    return LocalY * MatrixWidth + LocalX;
}

int32 ACreador2DWorldBuilder::GetCollisionMaskAt(int32 TileX, int32 TileY) const
{
    const int32 Index = LinearIndex(TileX, TileY);
    return CollisionMatrix.IsValidIndex(Index) ? CollisionMatrix[Index] : 0;
}

bool ACreador2DWorldBuilder::IsSolidAt(int32 TileX, int32 TileY) const
{
    return UCreador2DGrid::IsSolid(GetCollisionMaskAt(TileX, TileY));
}

FString ACreador2DWorldBuilder::GetBlockKeyAt(const FString& Layer, int32 TileX, int32 TileY) const
{
    const int32 Index = LinearIndex(TileX, TileY);
    if (Index == INDEX_NONE)
    {
        return FString();
    }

    const TArray<FString>* Cells = LayerCells.Find(Layer);
    return (Cells && Cells->IsValidIndex(Index)) ? (*Cells)[Index] : FString();
}
