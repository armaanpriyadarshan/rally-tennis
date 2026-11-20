# Import a Rocketbox avatar, bake two UV-space maps the texture step needs (rest-pose
# position of every texel, and which bone owns it), and export mesh + skeleton as GLB.
import bpy, sys, os, mathutils, numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
fbx, outdir, name = argv[0], argv[1], argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx, use_anim=False, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
# bake object transforms so the file is in metres, Z-up, with identity object matrices
bpy.ops.object.select_all(action='DESELECT')
for o in (arm, mesh): o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = mesh.data
print('mesh', len(me.vertices), 'verts', len(me.polygons), 'polys; world', mesh.matrix_world.to_translation(), mesh.scale[:])
zs = [ (mesh.matrix_world @ v.co).z for v in me.vertices ]; print('height', min(zs), max(zs))
# ---- UV-space bakes ----
N = int(argv[3]) if len(argv) > 3 else 1024
uv = me.uv_layers.active.data
groups = [g.name for g in mesh.vertex_groups]
def part_of(v):
    best, w = -1, 0
    for g in v.groups:
        if g.weight > w: best, w = g.group, g.weight
    return best
vpart = [part_of(v) for v in me.vertices]
PARTS = ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Finger', 'Thigh', 'Calf', 'Foot', 'Toe']
def cls(gi):
    n = groups[gi].replace('Bip01 ', '').replace('L ', '').replace('R ', '')
    for i, p in enumerate(PARTS):
        if n == p or (p == 'Finger' and n.startswith('Finger')) or (p == 'Toe' and n.startswith('Toe')): return i + 1
    return 6 if gi >= 0 else 0        # facial bones count as head
me.calc_loop_triangles()
for mi, mat in enumerate(me.materials):
    pos = np.zeros((N, N, 3), np.float32); part = np.zeros((N, N), np.uint8); cov = np.zeros((N, N), bool)
    for t in me.loop_triangles:
        if t.material_index != mi: continue
        P = [np.array(mesh.matrix_world @ me.vertices[vi].co) for vi in t.vertices]
        U = [np.array((uv[li].uv[0] * N, (1 - uv[li].uv[1]) * N)) for li in t.loops]
        pc = [cls(vpart[vi]) for vi in t.vertices]
        x0 = int(max(0, np.floor(min(u[0] for u in U)) - 1)); x1 = int(min(N - 1, np.ceil(max(u[0] for u in U)) + 1))
        y0 = int(max(0, np.floor(min(u[1] for u in U)) - 1)); y1 = int(min(N - 1, np.ceil(max(u[1] for u in U)) + 1))
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1])
        if abs(d) < 1e-9: continue
        a = ((U[1][1] - U[2][1]) * (xs - U[2][0]) + (U[2][0] - U[1][0]) * (ys - U[2][1])) / d
        b = ((U[2][1] - U[0][1]) * (xs - U[2][0]) + (U[0][0] - U[2][0]) * (ys - U[2][1])) / d
        c = 1 - a - b
        inside = (a >= -0.06) & (b >= -0.06) & (c >= -0.06)       # a texel of bleed past the island edge
        if not inside.any(): continue
        p = a[..., None] * P[0] + b[..., None] * P[1] + c[..., None] * P[2]
        sub_pos = pos[y0:y1 + 1, x0:x1 + 1]; sub_part = part[y0:y1 + 1, x0:x1 + 1]; sub_cov = cov[y0:y1 + 1, x0:x1 + 1]
        strict = (a >= 0) & (b >= 0) & (c >= 0)
        write = inside & (strict | ~sub_cov)
        sub_pos[write] = p[write]
        k = np.argmax(np.stack([a, b, c], -1), -1); pm = np.take(np.array(pc, np.uint8), k)
        sub_part[write] = pm[write]; sub_cov[write] = True
    tag = 'body' if 'body' in mat.name else 'head'
    np.savez_compressed(os.path.join(outdir, f'{name}_{tag}_bake.npz'), pos=pos, part=part, cov=cov)
    print('baked', mat.name, tag, int(cov.sum()), 'texels')
# joint positions the texture step needs (Blender space: z up, -y forward)
J = {b.name.replace('Bip01 ', ''): list(arm.matrix_world @ b.head_local) for b in arm.data.bones if 'Finger' not in b.name}
import json; json.dump({'joints': J, 'parts': PARTS}, open(os.path.join(outdir, f'{name}_joints.json'), 'w'))
# ---- export ----
for m in me.materials:
    m.use_nodes = True
    for n in list(m.node_tree.nodes):
        if n.type == 'TEX_IMAGE': m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(outdir, name + '.glb'), export_format='GLB', use_selection=True, export_apply=False, export_skins=True, export_animations=False,
                          export_yup=True, export_image_format='NONE', export_materials='EXPORT', export_normals=True, export_tangents=False, export_morph=False, export_all_influences=False)
print('exported', os.path.getsize(os.path.join(outdir, name + '.glb')))
