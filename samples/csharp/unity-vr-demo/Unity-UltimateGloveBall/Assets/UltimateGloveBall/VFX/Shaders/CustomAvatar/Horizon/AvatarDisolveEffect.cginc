#ifndef AVATAR_DISOLVE_EFFECT_INCLUDED
#define AVATAR_DISOLVE_EFFECT_INCLUDED

// This Shader is based on the output of ShaderGraph "Player_Dissolve"
#include "UnityCG.cginc"
#include "ShaderGraphFunctions.cginc"

sampler2D _NoiseTex;
float _DisAmount;
float4 Noise_Texture_TexelSize;
float Noise_Scale;
float Noise_Scroll_Speed;
float Noise_Cutoff;
float Noise_Cutoff_Smoothness;
float4 Main_Texture_TexelSize;
float4 Edge_Color;
float Edge_Width;
float Edge_Brightness;

void CalculateCustomEffect(float4 color, float3 worldPos, float3 worldNormal, out float3 albedo, out float3 emission, out float alpha)
{
    float4 _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_RGBA_0 = color;
    float _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_R_4 = _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_RGBA_0.r;
    float _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_G_5 = _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_RGBA_0.g;
    float _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_B_6 = _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_RGBA_0.b;
    float _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_A_7 = _SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_RGBA_0.a;
    float _Property_196757eab10a5789ae0b77076e839792_Out_0 = Noise_Cutoff;
    float _Property_36d6b25dfab93e8d993be0f496f2f18f_Out_0 = Noise_Cutoff;
    float _Property_fa46bc576a47c187bee1140f0261f903_Out_0 = Noise_Cutoff_Smoothness;
    float _Add_4a8bcbedd647bf8cb45164ed45861c44_Out_2;
    Unity_Add_float(_Property_36d6b25dfab93e8d993be0f496f2f18f_Out_0, _Property_fa46bc576a47c187bee1140f0261f903_Out_0, _Add_4a8bcbedd647bf8cb45164ed45861c44_Out_2);
    // originall: object space position
    float3 worldOrigin = mul(unity_ObjectToWorld, float4(0, 0, 0, 1)).xyz;
    float3 objPos = worldPos - worldOrigin;
    float _Split_d22f14ef9f560782a56ed230e18c64fa_R_1 = objPos.x;
    float _Split_d22f14ef9f560782a56ed230e18c64fa_G_2 = objPos.y;
    float _Split_d22f14ef9f560782a56ed230e18c64fa_B_3 = objPos.z;
    float _Split_d22f14ef9f560782a56ed230e18c64fa_A_4 = 0;
    float _Split_11109cc640d612869ec2da16275e4f4c_R_1 = worldPos.x;
    float _Split_11109cc640d612869ec2da16275e4f4c_G_2 = worldPos.y;
    float _Split_11109cc640d612869ec2da16275e4f4c_B_3 = worldPos.z;
    float _Split_11109cc640d612869ec2da16275e4f4c_A_4 = 0;
    float _Property_0276a8befcbb76899b5ad3e0669612ac_Out_0 = Noise_Scroll_Speed;
    float _Multiply_2d159cae3543ed89994d9eab1f2ae42e_Out_2;
    Unity_Multiply_float_float(_Time.y, _Property_0276a8befcbb76899b5ad3e0669612ac_Out_0, _Multiply_2d159cae3543ed89994d9eab1f2ae42e_Out_2);
    float _Add_17f604b0eacf1f81b3bbfe239a0b4189_Out_2;
    Unity_Add_float(_Split_11109cc640d612869ec2da16275e4f4c_G_2, _Multiply_2d159cae3543ed89994d9eab1f2ae42e_Out_2, _Add_17f604b0eacf1f81b3bbfe239a0b4189_Out_2);
    float _Subtract_933c7d74c9399888b587033ad961651f_Out_2;
    Unity_Subtract_float(_Split_11109cc640d612869ec2da16275e4f4c_G_2, _Multiply_2d159cae3543ed89994d9eab1f2ae42e_Out_2, _Subtract_933c7d74c9399888b587033ad961651f_Out_2);
    #if defined(INVERT)
    float _Invert_f6676180d2e1c08baecc2593c904c055_Out_0 = _Add_17f604b0eacf1f81b3bbfe239a0b4189_Out_2;
    #else
    float _Invert_f6676180d2e1c08baecc2593c904c055_Out_0 = _Subtract_933c7d74c9399888b587033ad961651f_Out_2;
    #endif
    float3 _Vector3_0e990737daeb0b83b74aee13cb7990bd_Out_0 = float3(_Split_11109cc640d612869ec2da16275e4f4c_R_1, _Invert_f6676180d2e1c08baecc2593c904c055_Out_0, _Split_11109cc640d612869ec2da16275e4f4c_B_3);
    float _Property_c8ab34de986c1182aa92454d209d2dcd_Out_0 = Noise_Scale;
    float3 Triplanar_c900e5cc5a0549828047cc0944e742ea_UV = _Vector3_0e990737daeb0b83b74aee13cb7990bd_Out_0 * _Property_c8ab34de986c1182aa92454d209d2dcd_Out_0;
    // dafuck shadergraph
    //float3 Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend = pow(worldNormal, min(1, floor(log2(0.0000001)/log2(1/sqrt(3)))) );
    float3 Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend = abs(worldNormal);
    Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend /= dot(Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend, 1.0);
    //float4 Triplanar_c900e5cc5a0549828047cc0944e742ea_X = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, Triplanar_c900e5cc5a0549828047cc0944e742ea_UV.zy);
    //float4 Triplanar_c900e5cc5a0549828047cc0944e742ea_Y = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, Triplanar_c900e5cc5a0549828047cc0944e742ea_UV.xz);
    //float4 Triplanar_c900e5cc5a0549828047cc0944e742ea_Z = SAMPLE_TEXTURE2D(_NoiseTex, sampler_NoiseTex, Triplanar_c900e5cc5a0549828047cc0944e742ea_UV.xy);
    float4 Triplanar_c900e5cc5a0549828047cc0944e742ea_X = tex2D(_NoiseTex, Triplanar_c900e5cc5a0549828047cc0944e742ea_UV.zy);
    float4 Triplanar_c900e5cc5a0549828047cc0944e742ea_Y = tex2D(_NoiseTex, Triplanar_c900e5cc5a0549828047cc0944e742ea_UV.xz);
    float4 Triplanar_c900e5cc5a0549828047cc0944e742ea_Z = tex2D(_NoiseTex, Triplanar_c900e5cc5a0549828047cc0944e742ea_UV.xy);
    float4 _Triplanar_c900e5cc5a0549828047cc0944e742ea_Out_0 = Triplanar_c900e5cc5a0549828047cc0944e742ea_X * Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend.x + Triplanar_c900e5cc5a0549828047cc0944e742ea_Y * Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend.y + Triplanar_c900e5cc5a0549828047cc0944e742ea_Z * Triplanar_c900e5cc5a0549828047cc0944e742ea_Blend.z;
    float4 _Add_bcab9088ba16b68eb5989305d025f86a_Out_2;
    Unity_Add_float4((_Split_d22f14ef9f560782a56ed230e18c64fa_G_2.xxxx), _Triplanar_c900e5cc5a0549828047cc0944e742ea_Out_0, _Add_bcab9088ba16b68eb5989305d025f86a_Out_2);
    float _Property_1a89df0335c3e78987223c4c3d9395ad_Out_0 = _DisAmount;
    float4 _Add_5692d4799e927789bd40531ab895607e_Out_2;
    Unity_Add_float4(_Add_bcab9088ba16b68eb5989305d025f86a_Out_2, (_Property_1a89df0335c3e78987223c4c3d9395ad_Out_0.xxxx), _Add_5692d4799e927789bd40531ab895607e_Out_2);
    float4 _Saturate_2c069b4fd45b048e85c261754494785e_Out_1;
    Unity_Saturate_float4(_Add_5692d4799e927789bd40531ab895607e_Out_2, _Saturate_2c069b4fd45b048e85c261754494785e_Out_1);
    float4 _Smoothstep_67fdb9e92a429f868c2316682ac93a2c_Out_3;
    Unity_Smoothstep_float4((_Property_196757eab10a5789ae0b77076e839792_Out_0.xxxx), (_Add_4a8bcbedd647bf8cb45164ed45861c44_Out_2.xxxx), _Saturate_2c069b4fd45b048e85c261754494785e_Out_1, _Smoothstep_67fdb9e92a429f868c2316682ac93a2c_Out_3);
    float4 _OneMinus_93305e1239197e8e8316719ec23484e3_Out_1;
    Unity_OneMinus_float4(_Smoothstep_67fdb9e92a429f868c2316682ac93a2c_Out_3, _OneMinus_93305e1239197e8e8316719ec23484e3_Out_1);
    #if defined(INVERT)
    float4 _Invert_26f4ae8772aafa8590cb9dfe8e642723_Out_0 = _Smoothstep_67fdb9e92a429f868c2316682ac93a2c_Out_3;
    #else
    float4 _Invert_26f4ae8772aafa8590cb9dfe8e642723_Out_0 = _OneMinus_93305e1239197e8e8316719ec23484e3_Out_1;
    #endif
    float4 _Multiply_de404891cefa348db9a59c67db70febf_Out_2;
    Unity_Multiply_float4_float4(_SampleTexture2D_ac65edc9c2af3f8a83d35eac7a394477_RGBA_0, _Invert_26f4ae8772aafa8590cb9dfe8e642723_Out_0, _Multiply_de404891cefa348db9a59c67db70febf_Out_2);
    float _Property_e33e708433332b8c9c31c7a021cc5fe5_Out_0 = Edge_Brightness;
    float _Property_9a346a1998d1de82a53f92ca1709e9d9_Out_0 = Noise_Cutoff;
    float _Property_224f586d162ff7869b519d6146476e7f_Out_0 = Edge_Width;
    float _Subtract_ab77340c92412c81ae9040584b0ed481_Out_2;
    Unity_Subtract_float(_Property_9a346a1998d1de82a53f92ca1709e9d9_Out_0, _Property_224f586d162ff7869b519d6146476e7f_Out_0, _Subtract_ab77340c92412c81ae9040584b0ed481_Out_2);
    float _Property_854a40b0ddf3e3849486ddf8558d879c_Out_0 = Noise_Cutoff;
    float _Property_97e09cff6ff7548ea91a0ffc786964bd_Out_0 = Noise_Cutoff_Smoothness;
    float _Add_96c050b4d0db69869d943ff9d8041635_Out_2;
    Unity_Add_float(_Property_854a40b0ddf3e3849486ddf8558d879c_Out_0, _Property_97e09cff6ff7548ea91a0ffc786964bd_Out_0, _Add_96c050b4d0db69869d943ff9d8041635_Out_2);
    float _Property_1300e66118ac148aa33e6b660f00881d_Out_0 = Edge_Width;
    float _Subtract_b702b9c8ce417a8aa55b71c948902f57_Out_2;
    Unity_Subtract_float(_Add_96c050b4d0db69869d943ff9d8041635_Out_2, _Property_1300e66118ac148aa33e6b660f00881d_Out_0, _Subtract_b702b9c8ce417a8aa55b71c948902f57_Out_2);
    float4 _Smoothstep_a2d202dc057d9c81b53e6cf51e18e6da_Out_3;
    Unity_Smoothstep_float4((_Subtract_ab77340c92412c81ae9040584b0ed481_Out_2.xxxx), (_Subtract_b702b9c8ce417a8aa55b71c948902f57_Out_2.xxxx), _Saturate_2c069b4fd45b048e85c261754494785e_Out_1, _Smoothstep_a2d202dc057d9c81b53e6cf51e18e6da_Out_3);
    float4 _Subtract_b4c03c95713aaf83b285507ddfb8a774_Out_2;
    Unity_Subtract_float4(_Smoothstep_a2d202dc057d9c81b53e6cf51e18e6da_Out_3, _Smoothstep_67fdb9e92a429f868c2316682ac93a2c_Out_3, _Subtract_b4c03c95713aaf83b285507ddfb8a774_Out_2);
    float4 _Property_5d48f33c014dc182a49573911cc0ea01_Out_0 = Edge_Color;
    float4 _Multiply_521af9d8b4ea8784b67020eed0f07cfe_Out_2;
    Unity_Multiply_float4_float4(_Subtract_b4c03c95713aaf83b285507ddfb8a774_Out_2, _Property_5d48f33c014dc182a49573911cc0ea01_Out_0, _Multiply_521af9d8b4ea8784b67020eed0f07cfe_Out_2);
    float4 _Multiply_fff93a72dbb9ad839d4b8439f506742c_Out_2;
    Unity_Multiply_float4_float4(_Triplanar_c900e5cc5a0549828047cc0944e742ea_Out_0, _Multiply_521af9d8b4ea8784b67020eed0f07cfe_Out_2, _Multiply_fff93a72dbb9ad839d4b8439f506742c_Out_2);
    float4 _Multiply_2a7e48dad483ce8dbb231cb6d757630d_Out_2;
    Unity_Multiply_float4_float4((_Property_e33e708433332b8c9c31c7a021cc5fe5_Out_0.xxxx), _Multiply_fff93a72dbb9ad839d4b8439f506742c_Out_2, _Multiply_2a7e48dad483ce8dbb231cb6d757630d_Out_2);
    #if defined(INVERT)
    float4 _Invert_3300805eda32e08d99c33dfb226b8b7e_Out_0 = _Smoothstep_a2d202dc057d9c81b53e6cf51e18e6da_Out_3;
    #else
    float4 _Invert_3300805eda32e08d99c33dfb226b8b7e_Out_0 = _OneMinus_93305e1239197e8e8316719ec23484e3_Out_1;
    #endif
    albedo = (_Multiply_de404891cefa348db9a59c67db70febf_Out_2.xyz);
    emission = (_Multiply_2a7e48dad483ce8dbb231cb6d757630d_Out_2.xyz);
    alpha = (_Invert_3300805eda32e08d99c33dfb226b8b7e_Out_0).x;
}

float4 ApplyDissolveEffect(float4 color, float3 worldPos, float3 worldNormal)
{
    float3 outCol, outEmission;
    float outAlpha;
    color.a = 1;
    CalculateCustomEffect(color, worldPos, worldNormal, outCol, outEmission, outAlpha);
    color.rgb = outCol + outEmission;
    color.a = outAlpha;
    return color;
}

#endif // AVATAR_DISOLVE_EFFECT_INCLUDED
