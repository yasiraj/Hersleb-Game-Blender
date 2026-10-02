"""Original first-person flashlight and hand, created through Blender MCP."""
import math
from pathlib import Path
import bpy

ROOT = Path('/workspace/Hersleb-Game-Blender')
OUTPUT = ROOT / 'public' / 'models'
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, roughness=0.6, emission=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return result

metal = material('Torch anodised aluminium', (0.06, 0.075, 0.07), 0.85, 0.3)
grip = material('Torch ribbed grip', (0.022, 0.026, 0.025), 0.0, 0.85)
skin = material('Student hand', (0.52, 0.34, 0.23), 0.0, 0.76)
sleeve = material('Student coat sleeve', (0.035, 0.045, 0.052), 0.0, 0.95)
lens = material('Torch lens', (0.75, 0.82, 0.65), 0.1, 0.15, 0.7)

def box(name, position, dimensions, mat, bevel=0.008):
    x,y,z=position
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,-z,y))
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=(dimensions[0],dimensions[2],dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier=obj.modifiers.new('Soft edges', 'BEVEL')
        modifier.width=bevel
        modifier.segments=2
    return obj

def cylinder(name, position, radius, length, mat):
    x,y,z=position
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=length, location=(x,-z,y), rotation=(math.pi/2,0,0))
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth=True
    return obj

cylinder('Flashlight body', (0,0,0), .034,.24,metal)
cylinder('Flashlight grip', (0,0,.035), .036,.13,grip)
cylinder('Flashlight head', (0,0,-.13), .049,.056,metal)
cylinder('Flashlight lens', (0,0,-.160), .043,.003,lens)
for i in range(7): cylinder('Grip ring', (0,0,-.015+i*.014), .038,.003,metal)
box('Palm', (.028,-.045,.03), (.105,.055,.13), skin, .02)
for i in range(4):
    finger=box('Finger', (-.013,-.02,-.017+i*.032), (.068,.041,.024),skin,.01)
box('Thumb', (.063,.006,-.001), (.031,.068,.052),skin,.012)
box('Wrist', (.041,-.07,.115), (.08,.06,.095),skin,.015)
box('Dark sleeve', (.041,-.095,.23), (.13,.115,.2),sleeve,.018)
bpy.context.scene.name='Student flashlight — MCP authored'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/'player-hands.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/'player-hands.glb'), export_format='GLB', export_apply=True)
print('MCP_PLAYER_HANDS_EXPORTED', len(bpy.data.objects))
