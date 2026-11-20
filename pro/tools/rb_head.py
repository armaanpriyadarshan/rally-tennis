# A Rocketbox avatar's head on its own: the head mesh, the skeleton it is skinned to, and its head
# colour (and, if given, normal) texture at a chosen size, as a small GLB. Material named 'head'.
#   blender -b --python tools/rb_head.py -- <avatar.fbx> <head_color.tga|.jpg> <head_normal.tga|.jpg|-> <out.glb> [color px=1024] [normal px=512] [jpeg q=82]
# JPEG inputs (already at size) are written into the GLB unchanged; that keeps the normal map from being stored as PNG.
import bpy, bmesh, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
fbx, col, nrm, out = argv[:4]; cpx = int(argv[4]) if len(argv) > 4 else 1024; npx = int(argv[5]) if len(argv) > 5 else 512; q = int(argv[6]) if len(argv) > 6 else 82
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx, use_anim=False, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in [arm] + meshes: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# keep only the faces whose material is the head's
mesh = next(o for o in meshes if any(m and 'head' in m.name.lower() for m in o.data.materials))
for o in meshes:
    if o is not mesh: bpy.data.objects.remove(o, do_unlink=True)
me = mesh.data; hi = next(i for i, m in enumerate(me.materials) if m and 'head' in m.name.lower())
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != hi], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
for f in bm.faces: f.material_index = 0
bm.to_mesh(me); bm.free()
mat = me.materials[hi]; me.materials.clear(); me.materials.append(mat); mat.name = 'head'
for f in me.polygons: f.material_index = 0
# shape keys and the face's morph targets are not wanted
if me.shape_keys: mesh.shape_key_clear()
# the material: colour, and the normal map if there is one
mat.use_nodes = True; nt = mat.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); outn = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(bsdf.outputs[0], outn.inputs[0])
def img(path, px, name, colour):
    im = bpy.data.images.load(path); im.name = name
    if not path.lower().endswith('.jpg') and im.size[0] != px: im.scale(px, px)                # a prepared JPEG is used as it is, and exported as it is
    if not colour: im.colorspace_settings.name = 'Non-Color'
    return im
tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img(col, cpx, 'head_color', True); nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
if nrm != '-' and os.path.exists(nrm):
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img(nrm, npx, 'head_normal', False); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=False, export_skins=True, export_animations=False, export_yup=True,
                          export_image_format='AUTO' if col.lower().endswith('.jpg') else 'JPEG', export_jpeg_quality=q, export_materials='EXPORT', export_normals=True, export_tangents=False, export_morph=False, export_all_influences=False)
print('HEADGLB', out, os.path.getsize(out), 'verts', len(me.vertices))
