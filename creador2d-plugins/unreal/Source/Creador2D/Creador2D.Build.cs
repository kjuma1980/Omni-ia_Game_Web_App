using UnrealBuildTool;

public class Creador2D : ModuleRules
{
    public Creador2D(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            // HTTP para descargar el mundo; Json/JsonUtilities para leerlo.
            "HTTP",
            "Json",
            "JsonUtilities",
            // ImageWrapper e ImageCore: decodifican los PNG de las capas de
            // parallax, que llegan incrustados como data URL en el export.
            "ImageWrapper",
            "ImageCore",
            "RenderCore",
        });
    }
}
