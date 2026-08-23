#include "Creador2DGrid.h"

const TArray<FString>& UCreador2DGrid::LayerOrder()
{
    // Orden de dibujado del editor: suelo, fosos, muros y capas superiores.
    static const TArray<FString> Order = {
        TEXT("GROUND"),
        TEXT("PIT"),
        TEXT("WALL"),
        TEXT("OVERLAY"),
    };

    return Order;
}

TArray<FString> UCreador2DGrid::Describe(int32 Mask)
{
    TArray<FString> Result;

    static const TPair<ECreador2DCollision, const TCHAR*> Names[] = {
        { ECreador2DCollision::Solid,   TEXT("SOLID") },
        { ECreador2DCollision::Water,   TEXT("WATER") },
        { ECreador2DCollision::Stairs,  TEXT("STAIRS") },
        { ECreador2DCollision::Pit,     TEXT("PIT") },
        { ECreador2DCollision::OneWay,  TEXT("ONE_WAY") },
        { ECreador2DCollision::Damage,  TEXT("DAMAGE") },
        { ECreador2DCollision::Ladder,  TEXT("LADDER") },
        { ECreador2DCollision::Trigger, TEXT("TRIGGER") },
    };

    for (const auto& Entry : Names)
    {
        if (HasFlag(Mask, Entry.Key))
        {
            Result.Add(Entry.Value);
        }
    }

    return Result;
}
