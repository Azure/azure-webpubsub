# Light Baking
To deliver good performance in this project we used light baking into lightmaps, light probes and reflection probes.
The use of a baked directional light gives us gains on the GPU side as there is no cost for generating shadows.

The concept of the Arena is an outdoors arena with half of the field covered with a roof, this presented some challenges in terms of rendering and how the light would be generated. We tried using Mixed Lighting but the cost of shadows was too great because of the size of the arena and the quality was poor. We tried adding cascade 4 and we were able to get some better visual quality but in the end the rendering cost was too large. We encourage you to look into it yourself and test out different configurations.

In order to bake the light and get good results we needed to change some of the elements in the scene. These settings are not useful at runtime so we created a script to setup the scene before we generate the lighting for the arena.

## How to bake the Arena
Load the Arena Scene [Assets/UltimateGloveBall/Scenes/Arena.unity](../Assets/UltimateGloveBall/Scenes/Arena.unity)

In the scene hierarchy you will see a disabled game object called LightingSetup.
![LightingSetup GameObject](./Media/editor/baking_gameobject_location.png)

After clicking on it we can use the context menu in the inspector to setup the scene.
![LightingSetup Context Menu](./Media/editor/baking_lightingsetup.png)

The last 2 options will set the scene. Selecting `Setup for Lighting` will enable some game objects that are necessary for the light baking. We enable some objects that are applying some Emissive light, enable backfaces that aren't seen at runtime but are needed to generate proper lightmaps, we set the crowd members to contribute to the GI so that they have some blob shadows baked underneath, and we set the trees to contribute to GI so that their shadows are baked in the lightmaps as well as the light probes.
Once the scene is setup, you can generate the light from the Lighting menu. Once done you can either reload the Arena scene or select the `Revert after lighting` menu option.
