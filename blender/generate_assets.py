"""Original procedural Hersleb scene; run with Blender 4.3+ in background.

Public OSM footprints stay in metres. Facade detail follows public photographs;
ground-floor room layout and game props are explicitly fictional/provisional.
All helpers take THREE coordinates (x, height, z); Blender stores (x, -z, height).
"""
from pathlib import Path
import bpy, json, math, random, struct
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'models'
OUTPUT.mkdir(parents=True, exist_ok=True)
random.seed(22)
REFERENCE = json.loads((Path(__file__).parent / 'reference' / 'hersleb-osm-layout.json').read_text())
COLLIDERS, LIGHTS, GROUPS, MATERIALS = [], [], {}, {}

def xyz(p): return (p[0], -p[2], p[1])
def mat(name, color, roughness=.8, metal=0, emission=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    if emission:
        p.inputs['Emission Color'].default_value = (*emission[0], 1)
        p.inputs['Emission Strength'].default_value = emission[1]
    MATERIALS[name] = m
    return name

def setup():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for d in list(bpy.data.materials): bpy.data.materials.remove(d)
    MATERIALS.clear(); GROUPS.clear()
    mat('cream', (.73,.63,.38)); mat('creamLight', (.83,.76,.54))
    mat('granite', (.24,.28,.30)); mat('stone', (.45,.47,.44))
    mat('slate', (.11,.14,.17), .68); mat('copper', (.34,.20,.12), .53, .3)
    mat('whiteFrame', (.74,.77,.75), .62); mat('darkGlass', (.025,.065,.095), .2, .23)
    mat('windowWarm', (.32,.22,.11), .25, .1, ((1,.65,.27), .32))
    mat('windowCold', (.09,.15,.19), .2, .1, ((.22,.45,.55), .18))
    mat('asphalt', (.047,.061,.075), .23); mat('paving', (.15,.18,.20), .48)
    mat('seam', (.072,.086,.095)); mat('puddle', (.08,.13,.19), .055, .3)
    mat('grass', (.035,.085,.064)); mat('bark', (.085,.065,.049))
    mat('leaves', (.065,.13,.095)); mat('iron', (.045,.055,.063), .5, .4)
    mat('wood', (.29,.14,.062)); mat('woodLight', (.42,.25,.095))
    mat('salmonWall', (.40,.30,.265)); mat('sage', (.16,.24,.20))
    mat('floor', (.14,.17,.18), .28); mat('ceiling', (.31,.33,.33))
    mat('locker', (.075,.145,.15), .62, .28); mat('lockerTrim', (.12,.22,.22), .5, .3)
    mat('paper', (.72,.71,.60)); mat('blueBook', (.10,.23,.32))
    mat('redBook', (.30,.06,.05)); mat('greenBook', (.13,.22,.11))
    mat('warmLamp', (.9,.7,.4), .3, 0, ((1,.64,.27), 3))
    mat('coldLamp', (.38,.57,.61), .2, 0, ((.35,.70,.8), 2))
    mat('redLamp', (.46,.005,.005), .3, 0, ((1,.025,.015), 2.5))
    mat('black', (.006,.009,.011), .9); mat('coat', (.015,.021,.022))
    mat('eye', (.65,.84,.75), .2, 0, ((.75,1,.86), 4))

def geometry(verts, faces, material, group='environment', smooth=False):
    g = GROUPS.setdefault(group, {'v':[], 'f':[], 'm':[], 's':[]})
    off = len(g['v']); g['v'].extend(xyz(p) for p in verts)
    g['f'].extend(tuple(i+off for i in f) for f in faces)
    g['m'].extend([material]*len(faces)); g['s'].extend([smooth]*len(faces))

def collider(name, low, high, kind='solid'):
    COLLIDERS.append({'id':name,'min':[round(x,3) for x in low], 'max':[round(x,3) for x in high], 'kind':kind})

def box(name, p, size, material, yaw=0, collide=False, group='environment'):
    a,b,c = (s/2 for s in size); co,si=math.cos(yaw),math.sin(yaw)
    v=[]
    for x,y,z in [(-a,-b,-c),(a,-b,-c),(a,b,-c),(-a,b,-c),(-a,-b,c),(a,-b,c),(a,b,c),(-a,b,c)]:
        v.append((p[0]+co*x+si*z,p[1]+y,p[2]-si*x+co*z))
    geometry(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],material,group)
    if collide: collider(name,[min(q[i] for q in v) for i in range(3)],[max(q[i] for q in v) for i in range(3)])

def cylinder(p, radius, height, material, sides=10, top=None, group='environment'):
    rt=radius if top is None else top
    v=[(p[0]+math.cos(i*math.tau/sides)*r,p[1]+y,p[2]+math.sin(i*math.tau/sides)*r)
       for y,r in [(-height/2,radius),(height/2,rt)] for i in range(sides)]
    f=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    f.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    geometry(v,f,material,group)

def ellipsoid(p, scale, material, group='environment', rings=5, segments=9):
    v=[]
    for j in range(rings+1):
        lat=-math.pi/2+math.pi*j/rings
        for i in range(segments):
            t=i*math.tau/segments
            v.append((p[0]+scale[0]*math.cos(lat)*math.cos(t),p[1]+scale[1]*math.sin(lat),p[2]+scale[2]*math.cos(lat)*math.sin(t)))
    f=[(j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i)
       for j in range(rings) for i in range(segments)]
    geometry(v,f,material,group,True)

def beam(a,b,width,material,group='environment'):
    # Cylinder along any line, transformed directly into THREE world coordinates.
    av,bv=Vector(a),Vector(b); d=bv-av; axis=d.normalized()
    u=axis.cross(Vector((0,1,0)))
    if u.length<.01: u=axis.cross(Vector((1,0,0)))
    u.normalize(); w=axis.cross(u).normalized(); sides=7
    v=[tuple(q+(u*math.cos(i*math.tau/sides)+w*math.sin(i*math.tau/sides))*width/2) for q in (av,bv) for i in range(sides)]
    f=[tuple(reversed(range(sides))),tuple(range(sides,2*sides))]
    f.extend((i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides))
    geometry(v,f,material,group)

def polygon_prism(points, bottom, top, material):
    ps=points[:-1] if points[0]==points[-1] else points
    n=len(ps); vertices=[(x,y,z) for y in (bottom,top) for x,z in ps]
    f=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    vectors=[Vector((x,z,0)) for x,z in ps]
    for tri in tessellate_polygon([vectors]):
        ids=[q if isinstance(q,int) else min(range(n),key=lambda i:(vectors[i]-q).length) for q in tri]
        f.append(tuple(i+n for i in ids)); f.append(tuple(reversed(ids)))
    geometry(vertices,f,material)

def text(body,p,size,material,yaw=0,group='environment'):
    curve=bpy.data.curves.new('type','FONT'); curve.body=body; curve.size=size
    curve.align_x='CENTER'; curve.align_y='CENTER'; curve.extrude=.007; curve.resolution_u=3
    obj=bpy.data.objects.new('text_'+body,curve); bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    bpy.ops.object.convert(target='MESH'); mesh=obj.data
    co,si=math.cos(yaw),math.sin(yaw)
    v=[(p[0]+co*q.co.x+si*q.co.z,p[1]+q.co.y,p[2]-si*q.co.x+co*q.co.z) for q in mesh.vertices]
    geometry(v,[tuple(poly.vertices) for poly in mesh.polygons],material,group)
    bpy.data.objects.remove(obj,do_unlink=True)

def point_light(p,color,intensity,distance,kind='point'):
    LIGHTS.append({'position':list(p),'color':color,'intensity':intensity,'distance':distance,'kind':kind})

def wall(a,b,height,material,thickness=.38,collide=True,bottom=0,name='wall'):
    x,z=(a[0]+b[0])/2,(a[1]+b[1])/2
    dx,dz=b[0]-a[0],b[1]-a[1]
    box(name,(x,bottom+height/2,z),(math.hypot(dx,dz),height,thickness),material,-math.atan2(dz,dx),collide)

def window(p,yaw,width=1.32,height=2.15,warm=False):
    co,si=math.cos(yaw),math.sin(yaw)
    def at(x,y,z): return (p[0]+co*x+si*z,p[1]+y,p[2]-si*x+co*z)
    box('window',p,(width,height,.045),'windowWarm' if warm else 'darkGlass',yaw)
    for x in (-width/2,width/2): box('window_frame',at(x,0,.05),(.095,height+.16,.10),'whiteFrame',yaw)
    for y in (-height/2,height/2): box('window_frame',at(0,y,.05),(width+.14,.10,.10),'whiteFrame',yaw)
    box('mullion',at(0,0,.07),(.07,height,.08),'whiteFrame',yaw)
    box('transom',at(0,.32,.07),(width,.075,.08),'whiteFrame',yaw)
    box('sill',at(0,-height/2-.10,.1),(width+.32,.12,.27),'stone',yaw)

def hiproof(x0,x1,z0,z1,eave,peak,material='slate'):
    inset=min((x1-x0)*.24,(z1-z0)*.47)
    v=[(x0,eave,z0),(x1,eave,z0),(x1,eave,z1),(x0,eave,z1),
       (x0+inset,peak,(z0+z1)/2),(x1-inset,peak,(z0+z1)/2)]
    geometry(v,[(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4)],material)
    for a,b in [(v[0],v[4]),(v[1],v[5]),(v[2],v[5]),(v[3],v[4]),(v[4],v[5])]:beam(a,b,.09,'copper')
    for a,b in [(v[0],v[1]),(v[1],v[2]),(v[2],v[3]),(v[3],v[0])]:beam(a,b,.17,'copper')
    # Readable slate courses, original mesh detail rather than downloaded textures.
    for t in [.12,.24,.36,.48,.60,.72,.84]:
        y=eave+(peak-eave)*t
        xa=x0+inset*t; xb=x1-inset*t
        for z in (z0+(z1-z0)/2*t,z1-(z1-z0)/2*t):
            beam((xa,y+.015,z),(xb,y+.015,z),.025,'granite')

def cupola(x,z,y,size=1.4):
    box('cupola_base',(x,y+.2,z),(size*1.3,.35,size*1.3),'creamLight')
    cylinder((x,y+1.15,z),size*.53,1.65,'copper',8)
    for i in range(8):
        a=i*math.tau/8
        box('cupola_louvre',(x+math.sin(a)*size*.50,y+1.14,z+math.cos(a)*size*.50),(size*.36,.98,.06),'black',a)
        for h in [.80,.96,1.12,1.28,1.44]:box('louvre_bar',(x+math.sin(a)*size*.54,y+h,z+math.cos(a)*size*.54),(size*.38,.065,.045),'copper',a)
    cylinder((x,y+2.24,z),size*.66,.75,'copper',8,top=size*.21)
    ellipsoid((x,y+2.57,z),(size*.23,.28,size*.23),'copper',rings=4,segments=8)
    beam((x,y+2.6,z),(x,y+3.35,z),.05,'iron')

def dormer(x,z,y,yaw=0):
    co,si=math.cos(yaw),math.sin(yaw)
    box('dormer',(x,y+.55,z),(1.65,1.5,.8),'copper',yaw)
    window((x+si*.44,y+.48,z+co*.44),yaw,1.0,1.10,False)
    local=[(-1.02,1.23,.55),(1.02,1.23,.55),(0,2.12,.55),(-1.02,1.23,-.55),(1.02,1.23,-.55),(0,2.12,-.55)]
    v=[(x+co*a+si*c,y+b,z-si*a+co*c) for a,b,c in local]
    geometry(v,[(0,1,2),(3,5,4),(0,2,5,3),(1,4,5,2)],'copper')

def bench(x,z,yaw=0):
    for dz in [-.22,0,.22]: box('bench_seat',(x,.48,z+dz),(2.3,.075,.17),'woodLight',yaw)
    for y in [.86,1.12]:box('bench_back',(x,y,z-.32),(2.3,.18,.075),'woodLight',yaw)
    for dx in [-.83,.83]:box('bench_leg',(x+dx,.28,z),(.11,.52,.65),'iron',yaw)
    collider('bench',[x-1.18,0,z-.43],[x+1.18,1.22,z+.43])

def streetlamp(x,z):
    cylinder((x,2.8,z),.075,5.6,'iron',8)
    cylinder((x,.3,z),.20,.6,'iron',8)
    box('lamp_head',(x,5.65,z),(1.05,.15,.42),'iron')
    box('lamp_glow',(x,5.55,z),(.80,.055,.27),'warmLamp')
    point_light((x,5.4,z),0xffd09a,36,19,'street')
    collider('lamp',[x-.18,0,z-.18],[x+.18,5.7,z+.18])

def tree(x,z,height=7):
    cylinder((x,height*.34,z),.17,height*.68,'bark',7,top=.09)
    for i in range(5):
        a=i*math.tau/5+.5; dx,dz=math.cos(a),math.sin(a)
        beam((x,height*.35,z),(x+dx*1.6,height*.78,z+dz*1.6),.09,'bark')
        ellipsoid((x+dx*1.1,height*.84,z+dz*1.1),(1.8,1.9,1.9),'leaves',rings=4,segments=7)
    ellipsoid((x,height,z),(2,1.7,2),'leaves',rings=4,segments=7)
    collider('tree',[x-.25,0,z-.25],[x+.25,height,z+.25])

def desk(x,z,yaw=0,science=False):
    w,d= (2.4,1.2) if science else (1.25,.75)
    box('desk',(x,.87,z),(w,.11,d),'granite' if science else 'woodLight',yaw)
    for dx in [-w*.42,w*.42]:
        for dz in [-d*.35,d*.35]:box('desk_leg',(x+dx,.42,z+dz),(.065,.8,.065),'iron',yaw)
    collider('desk',[x-w/2,0,z-d/2],[x+w/2,.95,z+d/2])
    if not science:
        box('chair',(x,.43,z+.73),(.52,.085,.48),'sage',yaw)
        box('chair_back',(x,.75,z+.95),(.52,.62,.075),'sage',yaw)
        for dx in [-.20,.20]: box('chair_leg',(x+dx,.23,z+.72),(.05,.45,.36),'iron',yaw)

def shelving(x,z,width=2.5,yaw=0):
    box('shelf_back',(x,1.20,z),(width,2.40,.44),'wood',yaw,True)
    for y in [.18,.67,1.16,1.65,2.17]:
        box('shelf',(x,y,z+.29),(width,.075,.72),'woodLight',yaw)
        for dx in range(int(width/.15)-1):
            bx=x-width/2+.14+dx*.15
            box('book',(bx,y+.21,z+.39),(.09,.34+random.random()*.12,.28),random.choice(['blueBook','redBook','greenBook','paper']),yaw)

def locker(x,z,hide_id):
    # Hollow cabinet with a real narrow viewing slit at crouched eye height.
    # One volume collider keeps regular movement outside; hiding can enter it.
    collider('locker',[x-.55,0,z-.34],[x+.55,2.44,z+.39])
    box('locker_back',(x,1.22,z-.315),(1.1,2.44,.05),'locker')
    for dx in [-.53,.53]:box('locker_side',(x+dx,1.22,z),(.045,2.44,.68),'locker')
    for yy in [.035,2.405]:box('locker_end',(x,yy,z),(1.1,.07,.68),'locker')
    box('locker_door_lower',(x,.49,z+.365),(1.02,.91,.04),'lockerTrim')
    box('locker_door_upper',(x,1.79,z+.365),(1.02,1.23,.04),'lockerTrim')
    for xx in [-.49,.49]:box('locker_slit_edge',(x+xx,1.05,z+.365),(.04,.25,.04),'lockerTrim')
    box('locker_seam',(x,1.24,z+.398),(.02,2.25,.015),'iron')
    for dx in [-.34,.34]:
        for yy in [1.92,2.04,2.16,.31,.40]:box('locker_vent',(x+dx,yy,z+.4),(.21,.03,.015),'black')
    box('locker_handle',(x+.13,1.16,z+.425),(.055,.18,.055),'stone')
    text('HIDE',(x,1.59,z+.421),.12,'paper')
    return {'id':hide_id,'name':'Locker','position':[x,0,z+.98],'hidePosition':[x-.22,0,z],'hideLookAt':[x-.22,1.04,z+3],'camera':[x-.22,1.04,z],'meshName':hide_id,'interactionDistance':1.8,'radius':1.8}

def realise():
    objs=[]; mats=list(MATERIALS.values()); names=list(MATERIALS)
    for name,g in GROUPS.items():
        pivot=xyz((24.5,0,42)) if name=='exit_gate_leaf' else (0,0,0)
        vertices=[tuple(v[i]-pivot[i] for i in range(3)) for v in g['v']]
        mesh=bpy.data.meshes.new(name+'_mesh'); mesh.from_pydata(vertices,[],g['f']);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
        obj.location=pivot
        for m in mats: mesh.materials.append(m)
        ids={n:i for i,n in enumerate(names)}
        for poly,material,smooth in zip(mesh.polygons,g['m'],g['s']):poly.material_index=ids[material];poly.use_smooth=smooth
        obj['coordinate_system']='THREE x,y,z; source Blender x,-z,y'
        if name.startswith('collect_'):obj['interactableId']=name[8:]
        objs.append(obj)
    return objs

def export_scene(filename):
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT/filename),export_format='GLB',
        export_texcoords=False,export_cameras=False,export_lights=False,
        export_animations=False,export_extras=True,export_apply=True)

def school():
    school_ids={'87949660','1030903734','113869394','113869415'}
    for b in REFERENCE['buildings']:
        if str(b['osm_id']) not in school_ids: continue
        points=b['points_xz']; bid=str(b['osm_id'])
        low=bid=='113869394'; floors=int(b['tags'].get('building:levels','4'))
        height=3.2*floors+.7
        polygon_prism(points,3.2 if bid=='87949660' else 0,height,'cream')
        if bid!='87949660':polygon_prism(points,-.1,.6,'granite')
        ps=points[:-1]
        if bid=='87949660':
            # Real exterior ground-floor edges, with fictional level entrance at x4.
            for i,a in enumerate(ps):
                b2=ps[(i+1)%len(ps)]
                if a[0]<3 and b2[0]>6 and abs(a[1])<.4 and abs(b2[1])<.4:
                    wall(a,(2,a[1]),3.2,'cream',name='school_front_left')
                    wall((6,b2[1]),b2,3.2,'cream',name='school_front_right')
                    wall(a,(2,a[1]),.6,'granite',.41,name='exterior_plinth')
                    wall((6,b2[1]),b2,.6,'granite',.41,name='exterior_plinth')
                    wall((2,0),(6,0),.35,'cream',bottom=2.85,collide=False)
                else:
                    wall(a,b2,3.2,'cream',name='school_boundary')
                    wall(a,b2,.6,'granite',.41,name='exterior_plinth')
        else:
            # Closed contextual wings; selected main-wing ground floor is playable.
            if not low:
                # Follow concave footprints rather than blocking their whole
                # bounding rectangle, which would swallow the open courtyard.
                # Short overlapping sections also bound diagonal edges closely.
                for i,a in enumerate(ps):
                    b2=ps[(i+1)%len(ps)]
                    sections=max(1,math.ceil(math.dist(a,b2)/.75))
                    for j in range(sections):
                        p=[a[k]+(b2[k]-a[k])*j/sections for k in range(2)]
                        q=[a[k]+(b2[k]-a[k])*(j+1)/sections for k in range(2)]
                        collider(f'school_context_{bid}_{i}_{j}',
                                 [min(p[0],q[0])-.12,0,min(p[1],q[1])-.12],
                                 [max(p[0],q[0])+.12,height,max(p[1],q[1])+.12])
        # Put photo-derived white-framed windows on every long facade segment.
        for i,a in enumerate(ps):
            b2=ps[(i+1)%len(ps)]; dx,dz=b2[0]-a[0],b2[1]-a[1]; length=math.hypot(dx,dz)
            if length<6 or low:continue
            count=max(1,int(length/3.7)); yaw=-math.atan2(dz,dx)
            # OSM winding exterior side: outward normal is +normal localz.
            nx,nz=math.sin(yaw),math.cos(yaw)
            for row in range(floors):
                for j in range(count):
                    t=(j+.5)/count; x,z=a[0]+dx*t,a[1]+dz*t
                    if bid=='87949660' and row==0 and 1.3<x<6.7 and abs(z)<.4:continue
                    window((x+nx*.23,1.92+row*3.17,z+nz*.23),yaw,1.35,2.18,random.random()<.45)
            wall(a,b2,.18,'creamLight',.56,False,height-.20)
            wall(a,b2,.12,'stone',.50,False,.75)
        if bid=='87949660':
            hiproof(-40,40.5,-20.5,.8,13.7,21)
            for x in [-32,-22,-12,-2,8,18,28]:dormer(x,-2.3,15.2)
            cupola(31,-9.6,21,1.35); cupola(-31,-9.6,21,1.2)
        elif bid=='1030903734':
            hiproof(-28.4,-15.7,.2,31,13.7,18.7)
            hiproof(-29,-3,28.6,41,13.7,18.8)
            # Iconic square clock-tower shaft in the inner courtyard corner.
            box('clock_tower',(-14.0,9.0,2.1),(3.45,18,3.45),'creamLight')
            box('clock_tower_cornice',(-14,18.1,2.1),(3.8,.28,3.8),'stone')
            cupola(-14,2.1,18.3,2.5)
            cylinder((-14,15.9,4.0),.65,.07,'paper',20)
            # Clock disc is a flattened sphere in the courtyard-facing plane.
            ellipsoid((-14,15.9,3.87),(.7,.7,.045),'paper',rings=8,segments=16)
            beam((-14,15.9,3.92),(-14,16.37,3.93),.045,'iron')
            beam((-14,15.9,3.94),(-13.66,15.65,3.95),.045,'iron')
            for z in [7,14,21,32,37]:
                for row in range(4):window((-15.48,1.92+3.17*row,z),math.pi/2,1.38,2.2,True)
            for z in [10,19,27]:dormer(-17.1,z,14.9,math.pi/2)
        elif bid=='113869394':
            hiproof(39.3,87.6,-19.5,-12.9,3.75,5.6)
            # Open arcade with faceted masonry arches and square granite posts.
            for x in [42+4*i for i in range(12)]:
                box('arcade_column',(x,1.15,-13.1),(.48,2.3,.48),'granite',collide=True)
                for i in range(9):
                    t=i*math.pi/8; xx=x+1.9+1.75*math.cos(t); yy=2.25+1.25*math.sin(t)
                    box('arch_stone',(xx,yy,-13.1),(.43,.40,.5),'creamLight',yaw=0)
            for x in [48,60,72,83]:bench(x,-16)
        else:hiproof(87,108.5,-19.6,-7.5,7.2,11)

def interiors():
    # Official Plan 0 photos inspire salmon/sage colours, grey reflective floor,
    # grid ceiling and disc pendants. Positions and room plan remain fictional.
    box('school_floor',(.2,-.055,-9.4),(78.1,.10,18.7),'floor')
    box('upper_floor',(.2,3.18,-9.4),(78.1,.10,18.7),'ceiling')
    for z in [-17,-14,-11,-8,-5,-2]:box('tile_joint',(.2,.005,z),(78,.01,.026),'seam')
    for x in range(-37,40,3):box('tile_joint',(x,.005,-9.4),(.024,.01,18.7),'seam')
    # Hall sides, always leave generous 2.8m doorways.
    for z,openings in [(-7.5,[(-30,-27),(-9,-6),(2,6),(12,15),(29,32)]),(-11.5,[(-30,-27),(-9,-6),(12,15),(29,32)])]:
        edge=-38.4
        for lo,hi in openings:
            wall((edge,z),(lo,z),3.15,'salmonWall',.22,name='hall_wall')
            wall((lo,z),(hi,z),.38,'sage',.28,False,2.77)
            for x in [lo,hi]:box('door_jamb',(x,1.38,z),(.12,2.77,.30),'sage')
            edge=hi
        wall((edge,z),(39.2,z),3.15,'salmonWall',.22,name='hall_wall')
    for x in [-16,2,6,22]:wall((x,-7.5),(x,0),3.15,'salmonWall',.20,name='room_partition')
    for x in [-18,2,24]:wall((x,-18.8),(x,-11.5),3.15,'salmonWall',.20,name='room_partition')
    wall((-38.5,-11.5),(-38.5,-7.5),3.15,'salmonWall',.24,name='hall_end')
    wall((39.2,-11.5),(39.2,-7.5),3.15,'salmonWall',.24,name='hall_end')
    # Baseboards and suspended ceiling lines.
    for z in [-7.52,-11.48]:box('hall_baseboard',(.2,.10,z),(77,.20,.035),'granite')
    for x in range(-37,40,2):box('ceiling_grid',(x,3.10,-9.5),(.045,.025,4),'whiteFrame')
    for z in [-7.55,-9.5,-11.45]:box('ceiling_grid',(.2,3.10,z),(77,.025,.045),'whiteFrame')
    # Cream shallow arches recall the school's photographed historic halls.
    # They sit above the walking route; doorways and collisions stay unchanged.
    for x in [-16,3,23]:
        for i in range(10):
            a,b=i*math.pi/10,(i+1)*math.pi/10
            v=[]
            for dx in [-.14,.14]:
                for radius,rise,t in [(2.0,.66,a),(2.0,.66,b),(2.14,.85,b),(2.14,.85,a)]:
                    v.append((x+dx,2.15+rise*math.sin(t),-9.5+radius*math.cos(t)))
            geometry(v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'creamLight')
        for z in [-7.48,-11.52]:box('arch_pier',(x,1.06,z),(.32,2.14,.22),'creamLight')
    for x in [-33,-23,-13,-3,7,17,27,36]:
        cylinder((x,2.91,-9.5),.46,.075,'coldLamp',16)
        beam((x,2.98,-9.5),(x,3.1,-9.5),.025,'iron')
        point_light((x,2.75,-9.5),0x88b6bd,11,12,'hall')
    for x,z in [(-7,-3),(13,-3),(30,-3),(-29,-16),(-8,-16),(14,-16),(31,-16)]:
        cylinder((x,2.91,z),.55,.085,'warmLamp',16)
        point_light((x,2.72,z),0xe8b776,13,14,'room')
    for name,x,z,dir in [('RESEPSJON',-7.5,-7.33,0),('BIBLIOTEK',13.5,-7.33,0),('KLASSEROM',30.5,-7.33,0),('ARKIV',-28.5,-11.68,math.pi),('NATURFAG',13.5,-11.68,math.pi)]:
        box('room_sign',(x,2.72,z),(2.45,.33,.04),'sage',dir)
        text(name,(x,2.73,z+(.031 if dir==0 else -.031)),.21,'paper',dir)
    # Reception counter, paper notices and computer.
    box('reception_counter',(-7, .56,-3.8),(5.4,1.12,1.0),'sage',collide=True)
    box('counter_top',(-7,1.16,-3.8),(5.6,.10,1.1),'woodLight')
    box('monitor',(-8,1.54,-3.65),(.72,.47,.07),'black')
    box('monitor_screen',(-8,1.54,-3.60),(.63,.38,.015),'coldLamp')
    box('notice_board',(-12.7,1.66,-.38),(2.4,1.4,.06),'wood')
    for x,z in [(-12.05,.04),(-12.8,.04),(-13.5,.04)]:box('paper_notice',(x,1.8,-.29),(.45,.65,.02),'paper')
    text('HERSLEB VGS',(-12.7,2.54,-.27),.23,'paper')
    # Library: book-filled shelving, tables and chairs with routes between rows.
    for x in [8,18]:shelving(x,-1.1,3.0)
    for x in [9,18]:desk(x,-4.2)
    for x in [-34,-24]:shelving(x,-17.8,3.2)
    desk(-29,-14.5);desk(-23,-14.5)
    for x in [-12,-5]:shelving(x,-17.8,3)
    # Chunky classroom furniture, leaving a clear hall/door approach.
    for x in [26,30,34]:
        for z in [-2.0,-4.4]:desk(x,z)
    box('blackboard',(37.9,1.7,-3.8),(.09,1.4,4.6),'sage')
    text('IKKE SE TILBAKE',(37.80,1.8,-3.8),.28,'paper',-math.pi/2)
    # Science benches and original flask shapes.
    for x in [7,14,21]:
        desk(x,-16,science=True)
        for dx in [-.75,.30]:
            cylinder((x+dx,1.12,-16),.10,.30,'windowCold',8,top=.045)
            cylinder((x+dx,1.32,-16),.04,.16,'windowCold',8)
    for x in [27,33]:box('utility_crate',(x,.65,-16),(1.8,1.3,1.7),'wood',collide=True)
    # Wayfinding, mundane school clutter and lurking shadows.
    for x in [-18,1,21]:
        box('emergency_sign',(x,2.61,-7.31),(1.0,.26,.04),'sage')
        text('UTGANG  →',(x,2.61,-7.28),.17,'paper')
    for x in [-19,20]:
        cylinder((x,1.15,-11.31),.12,.65,'redBook',8)
        box('fire_sign',(x,1.91,-11.31),(.3,.28,.04),'redBook')
    box('breaker_cabinet',(7.8,1.50,-7.69),(.66,.85,.14),'iron',group='breaker_panel')
    box('breaker_face',(7.8,1.50,-7.79),(.59,.75,.035),'granite',group='breaker_panel')
    for x in [7.62,7.80,7.98]:box('breaker_switch',(x,1.53,-7.83),(.07,.19,.055),'black',group='breaker_panel')
    box('breaker_warning',(7.8,1.76,-7.83),(.20,.09,.03),'redLamp',group='breaker_panel')
    text('SIKRING',(7.8,2.03,-7.83),.14,'paper',math.pi,group='breaker_panel')
    hide=[]
    for i,x in enumerate([-34,-21,-2,20,35]):hide.append(locker(x,-11.0,'locker-'+str(i+1)))
    hide.append(locker(28,-18.1,'locker-science'))
    return hide

def neighbourhood():
    box('world_ground',(10,-.18,10),(300,.28,250),'asphalt')
    grounds=next(g for g in REFERENCE['school_grounds']
                 if str(g['osm_id'])==str(REFERENCE['school']['grounds_way_id']))
    polygon_prism(grounds['points_xz'],-.035,0,'paving')
    for b in REFERENCE['buildings']:
        if str(b['osm_id']) in {'87949660','1030903734','113869394','113869415'}:continue
        ps=b['points_xz']
        if not ps or min(x for x,z in ps)>130 or max(x for x,z in ps)<-95 or min(z for x,z in ps)>125 or max(z for x,z in ps)<-80:continue
        levels=int(float(b['tags'].get('building:levels','4')))
        h=levels*3.15+.4; material=random.choice(['cream','granite','salmonWall','stone'])
        polygon_prism(ps,0,h,material)
        clean=ps[:-1]
        for i,a in enumerate(clean):
            c=clean[(i+1)%len(clean)];length=math.dist(a,c)
            if length<7:continue
            yaw=-math.atan2(c[1]-a[1],c[0]-a[0]);nx,nz=math.sin(yaw),math.cos(yaw)
            # Economical distant-window strips retain the actual footprints.
            count=min(9,int(length/3.3))
            for row in range(min(levels,5)):
                for j in range(count):
                    t=(j+.5)/count;x=a[0]+(c[0]-a[0])*t;z=a[1]+(c[1]-a[1])*t
                    box('neighbour_window',(x+nx*.03,1.7+row*3.15,z+nz*.03),(1.25,1.7,.04),'windowWarm' if random.random()<.12 else 'darkGlass',yaw)
        polygon_prism(ps,h,h+.20,'slate')
    for road in REFERENCE['streets_and_paths']:
        ps=road['points_xz']; kind=road['tags'].get('highway','')
        # Centre lines are map-derived; widths and surface detail are provisional.
        road_widths={'primary':9.2,'secondary':7.6,'tertiary':6.2,'residential':5.4,
                     'unclassified':5.4,'pedestrian':4.0,'service':4.2,
                     'living_street':4.8,'footway':2.2,'cycleway':2.2,'path':1.6}
        if kind not in road_widths:continue
        width=road_widths[kind]
        surface='paving' if kind in ['footway','cycleway','path','pedestrian'] else 'asphalt'
        for a,b in zip(ps,ps[1:]):
            if math.dist(a,b)<.2:continue
            wall(a,b,.02,surface,width,False,bottom=.006)
            if kind in ['primary','secondary','tertiary','residential']:
                mid=((a[0]+b[0])/2,.031,(a[1]+b[1])/2)
                box('road_marking',mid,(min(math.dist(a,b)*.40,3),.01,.075),'paper',-math.atan2(b[1]-a[1],b[0]-a[0]))

def courtyard():
    # Photo-inspired school garden and basketball surface. Detail placement is
    # provisional, and no externally sourced photo/student artwork is embedded.
    box('yard_court',(18,.012,22),(26,.025,26),'paving')
    for x in [5,31]:box('court_line',(x,.028,22),(.075,.01,26),'paper')
    for z in [9,35]:box('court_line',(18,.028,z),(26,.01,.075),'paper')
    for z in [11,33]:
        cylinder((18,1.7,z),.085,3.4,'iron')
        box('basket_backboard',(18,3.25,z+.15),(1.75,1.05,.075),'paper')
        box('basket_square',(18,3.16,z+.198),(.6,.4,.012),'redBook')
        # Hoop ring, original mesh.
        for i in range(12):
            a,b=i*math.tau/12,(i+1)*math.tau/12
            beam((18+.24*math.cos(a),2.94,z+.65+.24*math.sin(a)),(18+.24*math.cos(b),2.94,z+.65+.24*math.sin(b)),.035,'redBook')
        collider('basket',[17.86,0,z-.14],[18.14,3.5,z+.14])
    for x,z,w,d in [(-9,21,4,20),(36,20,4,24),(9,40,14,3)]:
        box('garden_bed',(x,.03,z),(w,.05,d),'grass')
        for dx in [-w/2,w/2]:box('garden_edge',(x+dx,.09,z),(.1,.15,d),'stone')
    for x,z,h in [(-9,9,7),(-9,25,6.5),(36,9,7.5),(36,27,7.8),(9,40,6),(49,30,7)]:tree(x,z,h)
    for x,z in [(-5,16),(-5,29),(32,17),(32,29),(4,38)]:bench(x,z)
    for x,z in [(-12,6),(33,5),(-7,38),(41,37)]:streetlamp(x,z)
    for i in range(15):
        x=random.uniform(-12,37); z=random.uniform(5,38)
        ellipsoid((x,.024,z),(random.uniform(.6,2.3),.007,random.uniform(.3,1.0)),'puddle',rings=2,segments=10)
    # Entry lamp, decorative stone portal and plaque.
    for x in [1.65,6.35]:
        box('entry_pier',(x,1.5,.16),(.5,3.0,.72),'stone')
        box('entry_lamp',(x,2.68,.70),(.27,.41,.20),'warmLamp')
        point_light((x,2.8,1.1),0xffc37b,24,12,'entry')
    box('entry_lintel',(4,3.10,.14),(5.4,.35,.76),'stone')
    box('entry_signboard',(4,3.72,.31),(10.8,.78,.10),'sage')
    text('HERSLEB VIDEREGÅENDE SKOLE',(4,3.73,.38),.42,'paper')
    text('EST. 1922',(4,3.15,.57),.20,'iron')
    # Stylised school fountain reflects photographed stone feature.
    cylinder((-2,.3,1.5),.65,.58,'stone',12)
    cylinder((-2,1.08,1.5),.22,1.1,'granite',10,top=.15)
    cylinder((-2,1.67,1.5),.51,.18,'stone',12)
    # Real courtyard boundary is approximated with a gameplay exit on +z.
    for lo,hi in [(-2,24),(30,44)]:
        for x in range(int(lo),int(hi)+1):
            beam((x,0,42),(x,1.8,42),.04,'iron')
        for y in [.48,1.45]:beam((lo,y,42),(hi,y,42),.07,'iron')
        collider('yard_fence',[lo,0,41.95],[hi,1.82,42.05])
    for x in [24,30]:box('gate_pier',(x,1.25,42),(.65,2.5,.65),'granite',collide=True)
    # Mesh separated for unlocking/removal by the frontend.
    for x in [24.7+i*.43 for i in range(12)]:beam((x,.1,42),(x,2.15,42),.045,'iron','exit_gate_leaf')
    for y in [.5,1.7]:beam((24.5,y,42),(29.5,y,42),.06,'iron','exit_gate_leaf')
    box('gate_lock',(27,1.10,42.05),(.21,.28,.12),'copper',group='exit_gate_leaf')
    collider('exit-gate',[24.5,0,41.96],[29.5,2.18,42.05],'gate')
    point_light((27,2.2,42.4),0xb42a1e,8,7,'exit')
    text('HERSLEBS GATE',(42,2.2,41),.25,'paper')

def collectables():
    box('student-id',(-5.5,1.23,-3.68),(.28,.025,.18),'paper',group='collect_student-id')
    box('student-id-photo',(-5.57,1.249,-3.68),(.055,.008,.07),'blueBook',group='collect_student-id')
    for x in [-5.47,-5.44]:box('id_line',(x,1.249,-3.68),(.015,.008,.11),'sage',group='collect_student-id')
    cylinder((14.55,1.04,-16),.065,.20,'copper',10,group='collect_fuse')
    cylinder((14.55,1.20,-16),.072,.13,'paper',10,group='collect_fuse')
    cylinder((14.55,1.31,-16),.065,.055,'copper',10,group='collect_fuse')
    # Archive key: ring and toothed shaft, horizontal on the library desk.
    for i in range(10):
        a,b=i*math.tau/10,(i+1)*math.tau/10
        beam((9+.09*math.cos(a),.947,-4.2+.09*math.sin(a)),(9+.09*math.cos(b),.947,-4.2+.09*math.sin(b)),.025,'copper','collect_archive-key')
    beam((9.06,.947,-4.2),(9.32,.947,-4.2),.038,'copper','collect_archive-key')
    box('key_tooth',(9.27,.948,-4.15),(.07,.04,.13),'copper',group='collect_archive-key')
    return [
        {'id':'student-id','type':'collect','kind':'item','name':'Student ID','position':[-5.5,1.25,-3.68],'meshName':'collect_student-id','interactionDistance':2.2,'radius':2.2,'description':'Find your name in the reception log.'},
        {'id':'fuse','type':'collect','kind':'item','name':'Emergency fuse','position':[14.55,1.19,-16],'meshName':'collect_fuse','interactionDistance':2.2,'radius':2.2,'description':'Restore the courtyard gate circuit.'},
        {'id':'archive-key','type':'collect','kind':'item','name':'Archive key','position':[9.15,.95,-4.2],'meshName':'collect_archive-key','interactionDistance':2.2,'radius':2.2,'description':'Recover the missing archive key.'}
    ]

def make_enemy():
    setup()
    bpy.context.scene.name='Caretaker — fictional pursuer'
    cylinder((0,1.0,0),.39,1.2,'coat',8,top=.27,group='the_caretaker')
    box('shoulders',(0,1.57,0),(.82,.22,.34),'coat',group='the_caretaker')
    ellipsoid((0,1.94,.035),(.225,.29,.19),'black','the_caretaker',rings=5,segments=8)
    for x in [-.095,.095]:ellipsoid((x,1.98,.195),(.047,.014,.017),'eye','the_caretaker',rings=3,segments=6)
    for s in [-1,1]:
        beam((s*.32,1.55,0),(s*.50,1.03,.01),.18,'coat','the_caretaker')
        beam((s*.50,1.03,.01),(s*.62,.54,.12),.12,'coat','the_caretaker')
        ellipsoid((s*.62,.47,.13),(.08,.17,.07),'black','the_caretaker',rings=4,segments=6)
        beam((s*.17,.66,0),(s*.19,.20,.03),.16,'black','the_caretaker')
        box('boot',(s*.19,.1,.13),(.21,.18,.36),'black',group='the_caretaker')
    # Tattered coat hem, recognisable elongated horror silhouette.
    for i in range(8):
        a=i*math.tau/8
        beam((.29*math.sin(a),.65,.29*math.cos(a)),(.37*math.sin(a),.26+random.random()*.15,.37*math.cos(a)),.12,'coat','the_caretaker')
    realise();bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).parent/'caretaker.blend'))
    export_scene('enemy.glb')

def save_environment():
    COLLIDERS.clear();LIGHTS.clear();random.seed(22)
    setup(); neighbourhood();school();hide=interiors();courtyard();items=collectables();realise()
    bpy.context.scene.name='Hersleb — After Hours (provisional interior)'
    # Camera/light setup is saved for artists; browser receives the same camera.
    cam=bpy.data.objects.new('Courtyard hero',bpy.data.cameras.new('Hero lens'))
    bpy.context.collection.objects.link(cam);cam.location=xyz((18,10.5,58))
    aim=Vector(xyz((3,7,-1)))-cam.location;cam.rotation_euler=aim.to_track_quat('-Z','Y').to_euler();cam.data.lens=28
    bpy.context.scene.camera=cam
    world=bpy.context.scene.world or bpy.data.worlds.new('Night');bpy.context.scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.10,.16,.23,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.22
    for name,p,power,size,col in [('Moon',(-18,45,20),3800,60,(.4,.59,1)),('Courtyard wash',(8,16,15),2800,35,(1,.75,.48))]:
        light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size;light.color=col
        obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=xyz(p)
        obj.rotation_euler=(Vector(xyz((4,0,6)))-obj.location).to_track_quat('-Z','Y').to_euler()
    for i,l in enumerate(LIGHTS):
        d=bpy.data.lights.new('practical_'+str(i),'POINT');d.energy=l['intensity']*9
        c=l['color'];d.color=(((c>>16)&255)/255,((c>>8)&255)/255,(c&255)/255)
        obj=bpy.data.objects.new(d.name,d);bpy.context.collection.objects.link(obj);obj.location=xyz(l['position'])
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.render.resolution_x=960;scene.render.resolution_y=540;scene.render.resolution_percentage=100
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).parent/'hersleb-provisional.blend'))
    export_scene('environment.glb')
    data={'version':1,'coordinateSystem':'THREE metres: x horizontal, y up, z depth',
          'provenance':{'footprints':'OpenStreetMap community footprint polygons and storey tags; © OpenStreetMap contributors, ODbL. Not a verified building survey.','reference':'Public official school photos and Wikimedia 2014 courtyard photo inform original facade details. No photo textures embedded.','interior':'Fictional/provisional ground-floor plan, props, doors, garden and gameplay exit; NOT a surveyed 1:1 school model.'},
          'spawn':[4,0,20],'spawnLookAt':[4,0,0],'enemySpawn':[-30,0,-9.5], 'exit':[27,0,46],
          'heroCamera':{'position':[18,10.5,58],'target':[3,7,-1]},
          'navBounds':{'minX':-39,'maxX':42,'minZ':-21,'maxZ':48},
          'bounds':{'minX':-39,'maxX':42,'minZ':-21,'maxZ':48},
          'colliders':COLLIDERS,'lights':LIGHTS,
          'locations':[{'id':'courtyard','name':'Courtyard','position':[4,0,20]}, {'id':'entrance','name':'School entrance','position':[4,0,0]}, {'id':'hall','name':'Ground-floor hall','position':[4,0,-9.5]}, {'id':'reception','name':'Reception','position':[-7,0,-3]}, {'id':'library','name':'Library','position':[13,0,-3]}, {'id':'science','name':'Science room','position':[14,0,-15]}, {'id':'archive','name':'Archive','position':[-29,0,-15]}],
          'interactables':items+[{'id':'breaker','type':'breaker','kind':'breaker','name':'Emergency breaker','position':[7.8,1.5,-7.88],'meshName':'breaker_panel','interactionDistance':2.3,'prompt':'Install fuse and restore power'}, {'id':'exit-gate','type':'exit','kind':'exit-gate','name':'Courtyard exit','position':[27,1.0,41],'meshName':'exit_gate_leaf','interactionDistance':2.8,'radius':2.8}],
          'hideSpots':hide,'patrol':[[-30,0,-9.5],[-8,0,-9.5],[13,0,-9.5],[31,0,-9.5],[14,0,-14],[13,0,-9.5],[4,0,-2],[4,0,13],[24,0,20]]}
    region_bounds={'courtyard':(-16,42,0,42),'entrance':(2,6,-7.5,1),'hall':(-39,39,-11.5,-7.5),'reception':(-16,2,-7.5,0),'library':(6,22,-7.5,0),'science':(2,24,-19,-11.5),'archive':(-39,-18,-19,-11.5)}
    for location in data['locations']:
        a,b,c,d=region_bounds[location['id']]
        location['bounds']={'minX':a,'maxX':b,'minZ':c,'maxZ':d}
    data['locations'].append({'id':'street','name':'Herslebs gate','bounds':{'minX':-39,'maxX':42,'minZ':42,'maxZ':48}})
    (OUTPUT/'environment.json').write_text(json.dumps(data,indent=2)+'\n')
    print('ENVIRONMENT_READY',len(COLLIDERS),'colliders',len(LIGHTS),'lights',len(items),'items')

if __name__=='__main__':
    save_environment();make_enemy()
    for name in ['environment.glb','enemy.glb']:
        p=OUTPUT/name;b=p.read_bytes();assert b[:4]==b'glTF' and struct.unpack('<I',b[4:8])[0]==2
        print('VALID_GLB',name,len(b),'bytes')
