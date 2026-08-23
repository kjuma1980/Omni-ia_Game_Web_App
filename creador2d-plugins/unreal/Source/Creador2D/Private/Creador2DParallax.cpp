#include "Creador2DParallax.h"

#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "ImageUtils.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/Base64.h"

DEFINE_LOG_CATEGORY_STATIC(LogCreador2DParallax, Log, All);

ACreador2DParallax::ACreador2DParallax()
{
    PrimaryActorTick.bCanEverTick = true;
    Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    RootComponent = Root;
}

void ACreador2DParallax::BeginPlay()
{
    Super::BeginPlay();
}

int32 ACreador2DParallax::KindOrder(const FString& Kind)
{
    if (Kind == TEXT("SKY")) return 0;
    if (Kind == TEXT("FAR")) return 1;
    if (Kind == TEXT("MID")) return 2;
    if (Kind == TEXT("NEAR")) return 3;
    return 2;
}

void ACreador2DParallax::Build(const TArray<TSharedPtr<FJsonValue>>& ParallaxJson, float InUnitsPerPixel)
{
    ClearLayers();
    UnitsPerPixel = InUnitsPerPixel;

    for (const TSharedPtr<FJsonValue>& Value : ParallaxJson)
    {
        const TSharedPtr<FJsonObject> Object = Value->AsObject();
        if (!Object.IsValid() || !Object->GetBoolField(TEXT("visible")))
        {
            continue;
        }

        FString DataUrl;
        if (!Object->TryGetStringField(TEXT("imageUrl"), DataUrl) || DataUrl.IsEmpty())
        {
            continue;
        }

        FCreador2DParallaxLayer Layer;
        Layer.Kind = Object->GetStringField(TEXT("kind"));
        Layer.Name = Object->GetStringField(TEXT("name"));
        Object->TryGetNumberField(TEXT("speedX"), Layer.SpeedX);
        Object->TryGetNumberField(TEXT("speedY"), Layer.SpeedY);
        Object->TryGetNumberField(TEXT("opacity"), Layer.Opacity);
        Object->TryGetBoolField(TEXT("repeatX"), Layer.bRepeatX);
        Object->TryGetNumberField(TEXT("offsetY"), Layer.OffsetY);

        FString TintHex;
        if (Object->TryGetStringField(TEXT("tint"), TintHex))
        {
            Layer.Tint = FLinearColor::FromSRGBColor(FColor::FromHex(TintHex));
        }

        Layer.Texture = DecodeDataUrl(DataUrl);
        if (!Layer.Texture)
        {
            UE_LOG(LogCreador2DParallax, Warning, TEXT("No se pudo decodificar la capa \"%s\"."), *Layer.Name);
            continue;
        }

        Layers.Add(Layer);
    }

    // Orden de dibujado: lo mas lejano primero.
    Layers.Sort([](const FCreador2DParallaxLayer& A, const FCreador2DParallaxLayer& B) {
        return KindOrder(A.Kind) < KindOrder(B.Kind);
    });

    for (int32 Index = 0; Index < Layers.Num(); ++Index)
    {
        BuildLayer(Layers[Index], Index);
    }

    UE_LOG(LogCreador2DParallax, Log, TEXT("Parallax montado: %d capa(s)."), Layers.Num());
}

void ACreador2DParallax::BuildLayer(FCreador2DParallaxLayer& Layer, int32 Index)
{
    UStaticMesh* PlaneMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
    UMaterialInterface* BaseMaterial = LoadObject<UMaterialInterface>(
        nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));

    if (!PlaneMesh)
    {
        return;
    }

    const float Width = Layer.Texture->GetSizeX() * UnitsPerPixel;
    const float Height = Layer.Texture->GetSizeY() * UnitsPerPixel;
    Layer.TileWidth = Width;

    // Tres copias bastan para cubrir la pantalla y reciclarse: la del centro
    // mas una a cada lado.
    const int32 Copies = Layer.bRepeatX ? 3 : 1;

    for (int32 c = 0; c < Copies; ++c)
    {
        UStaticMeshComponent* Tile = NewObject<UStaticMeshComponent>(this);
        Tile->SetupAttachment(Root);
        Tile->RegisterComponent();
        Tile->SetStaticMesh(PlaneMesh);
        Tile->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        // El plano del motor mide 100 uu y esta en el plano XY; se gira para
        // quedar vertical, de cara a una camara que mira por el eje Y.
        Tile->SetRelativeRotation(FRotator(90.0f, 0.0f, 0.0f));
        Tile->SetWorldScale3D(FVector(Width / 100.0f, Height / 100.0f, 1.0f));

        if (BaseMaterial)
        {
            UMaterialInstanceDynamic* Dynamic = UMaterialInstanceDynamic::Create(BaseMaterial, this);
            Dynamic->SetTextureParameterValue(TEXT("Texture"), Layer.Texture);
            FLinearColor Colour = Layer.Tint;
            Colour.A = Layer.Opacity;
            Dynamic->SetVectorParameterValue(TEXT("Color"), Colour);
            Tile->SetMaterial(0, Dynamic);
        }

        Layer.Tiles.Add(Tile);
    }
}

void ACreador2DParallax::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    APlayerController* Controller = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
    if (!Controller || !Controller->PlayerCameraManager)
    {
        return;
    }

    const FVector CamPos = Controller->PlayerCameraManager->GetCameraLocation();

    for (int32 Index = 0; Index < Layers.Num(); ++Index)
    {
        FCreador2DParallaxLayer& Layer = Layers[Index];
        if (Layer.Tiles.Num() == 0)
        {
            continue;
        }

        // La capa sigue a la camara solo en la fraccion indicada.
        const float X = CamPos.X * (1.0f - Layer.SpeedX);
        const float Z = CamPos.Z * (1.0f - Layer.SpeedY) - Layer.OffsetY * UnitsPerPixel;
        const float DepthY = BaseDepthY + Index * 10.0f;

        if (Layer.Tiles.Num() == 1 || Layer.TileWidth <= 1.0f)
        {
            Layer.Tiles[0]->SetWorldLocation(FVector(X, DepthY, Z));
            continue;
        }

        // Ancla al multiplo de tile mas cercano: sin esto, al reciclar las
        // copias quedarian huecos al cruzar de una a la siguiente.
        const float Anchor = FMath::FloorToFloat((CamPos.X - X) / Layer.TileWidth) * Layer.TileWidth;

        for (int32 t = 0; t < Layer.Tiles.Num(); ++t)
        {
            const float Offset = Anchor + (t - Layer.Tiles.Num() / 2) * Layer.TileWidth;
            Layer.Tiles[t]->SetWorldLocation(FVector(X + Offset, DepthY, Z));
        }
    }
}

void ACreador2DParallax::ClearLayers()
{
    for (FCreador2DParallaxLayer& Layer : Layers)
    {
        for (UStaticMeshComponent* Tile : Layer.Tiles)
        {
            if (IsValid(Tile))
            {
                Tile->DestroyComponent();
            }
        }
    }

    Layers.Empty();
}

UTexture2D* ACreador2DParallax::DecodeDataUrl(const FString& DataUrl)
{
    int32 Comma = INDEX_NONE;
    DataUrl.FindChar(TEXT(','), Comma);

    const FString Payload = Comma != INDEX_NONE ? DataUrl.RightChop(Comma + 1) : DataUrl;

    TArray<uint8> Bytes;
    if (!FBase64::Decode(Payload, Bytes) || Bytes.Num() == 0)
    {
        return nullptr;
    }

    UTexture2D* Texture = FImageUtils::ImportBufferAsTexture2D(Bytes);
    if (Texture)
    {
        // Sin repeticion, el muestreo del borde mezcla la ultima columna con la
        // primera y aparece una linea fina en cada union.
        Texture->AddressX = TA_Wrap;
        Texture->AddressY = TA_Clamp;
        Texture->UpdateResource();
    }

    return Texture;
}
