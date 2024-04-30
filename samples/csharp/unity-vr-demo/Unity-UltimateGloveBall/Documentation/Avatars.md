# Avatars
To have a greater sense of self and engage more of a social feeling we integrated the Meta Avatars in this project.
Being able to reuse the platform Avatar creates a continuity on the platform where users can recognize each other between different applications.

You will find the Meta Avatar SDK in the packages directory([Packages/Avatar2](../Packages/Avatar2)). It was downloaded on the developer website https://developer.oculus.com/downloads/package/meta-avatars-sdk.

For the integration we followed the information highlighted on the developer website https://developer.oculus.com/documentation/unity/meta-avatars-overview/. The [AvatarEntity.cs](../Packages/com.meta.multiplayer.netcode-photon/Avatar/AvatarEntity.cs) implementation is where you will see how we setup the Avatar for body, lipsync, face and eye tracking. This setup is also associated with the [PlayerAvatarEntity Prefab](../Assets/UltimateGloveBall/Prefabs/Arena/Player/PlayerAvatarEntity.prefab) which contains all the behaviours and settings on how we use the Avatar in game.
To keep the avatar in sync with the user position, we track the Camera Rig root.

More information on Face and Eye tracking can be found [here](https://developer.oculus.com/documentation/unity/meta-avatars-face-eye-pose/).

## Networking
Since we are building a multiplayer game, it is necessary that we implement a networking solution for the Avatar.
This is done in [AvatarNetworking.cs](../Packages/com.meta.multiplayer.netcode-photon/Avatar/AvatarNetworking.cs). In this implementation we use the `RecordStreamData` function on the avatar entity to get the data to stream over the network. We then send it via rpc, which is then received by each other clients.
On the receiving end, we apply the data using the `ApplyStreamData` function which will properly apply the state of the Avatar. Additionally, we implemented a frequency to send different level of details (LOD) so that we can reduce the bandwidth while still keeping a good fidelity of the Avatar motion.

## Custom Shader
While we wanted to keep the same visuals as the provided shader in the Avatar SDK, we needed to add some effects to models. To do so, we copied over the shader files to our project([here](../Assets/UltimateGloveBall/VFX/Shaders/CustomAvatar)) in order to apply some modifications.
To minimize the difference between the original shader files and our custom one we implemented the new functionalities in `.cginc` files that we then reference.

[AvatarGhostEffect.cginc](../Assets/UltimateGloveBall/VFX/Shaders/CustomAvatar/Horizon/AvatarGhostEffect.cginc): This effect is triggered when the player takes the ghost ball, it creates an illusion of transparency by cutting small holes on the mesh as well as adding fresnel effect and colors.

[AvatarDisolveEffect.cginc](../Assets/UltimateGloveBall/VFX/Shaders/CustomAvatar/Horizon/AvatarDisolveEffect.cginc): This effect is triggered when the player spawn or despawn. It creates an illusion of the mesh dissolving by using alpha cutting as well as coloring.

The main functions from the 2 effects are called in [Avatar-Horizon.shader](../Assets/UltimateGloveBall/VFX/Shaders/CustomAvatar/Horizon/Avatar-Horizon.shader) and are triggered through keywords. The shader file was also modified to contain the needed properties for these effects to work.

We kept the changes minimal in the copied files so that it would be easy to update the shader files with the latest shader in the newer versions of the Meta Avatar SDK when comes time to update.

An additional change was required in the [AvatarUnityLighting.cginc](../Assets/UltimateGloveBall/VFX/Shaders/CustomAvatar/Horizon/UnityLighting/AvatarUnityLighting.cginc) file. We added a `clip` function in the `AVATAR_SHADER_FRAG_LIGHTING` definition so that our new effects would work, as they require alpha clipping.
