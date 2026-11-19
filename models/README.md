# Vehicle geometry

## Tesla Model 3 SR+ LFP

The simulator adds front and rear demonstration plates. Their fictional identifier comes from `data/vehicle.json` and is also printed in the PDF.

The visual body and cabin use **Tesla 2018 Model 3** by Ameer Studio, licensed CC BY 4.0. The GLB is copied from the local Tesla 3D library. At runtime the simulator aligns the mesh to the wheelbase and track in `data/vehicle.json`, splits the axle meshes into four independently pivoted wheels and scales them to the simulated tire radius. The driver view makes the windscreen clearer. The body is a visualization of the pre-refresh Model 3. The TUM 2020 SR+ LFP plant supplies the physics and battery data. The suspension joints need measured coordinates. [Ameer Studio model](https://skfb.ly/oo9Y6), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [Tesla dimensions](https://www.tesla.com/ownersmanual/2017_2023_model3/en_us/GUID-56562137-FC31-4110-A13C-9A9FC6657BF0.html)

`tesla-pack.stl` is a 57,248-triangle tessellation of Nico Rosenberger et al.'s `Dataset_article/1_Battery/01_Battery_CAD/Battery_Pack.stp`. The original STEP bounds are 1470 × 2115.32 × 315 mm. The app scales millimetres to metres and places the higher section toward the rear, centered between the axle planes. The placement is a visual assumption pending chassis mount coordinates. The TUM data are licensed CC BY 4.0. [TUM dataset](https://doi.org/10.14459/2024mp1735494), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Woodpecker chassis

`woodpecker-crossbar.stl` derives from the local `Woodpecker_Frame/Parasolid/Crossbar.STEP`. It retains the original part coordinates in millimetres (45 × 200 × 1500 mm bounds). This is the first component of the Woodpecker geometry. Its assembly placement depends on the full assembly export.

On the SolidWorks PC, open `Woodpecker_Frame/Frame_assy_v1.SLDASM` or the complete vehicle assembly that resolves the wheels, arms and uprights at nominal ride height. Resolve the referenced components and confirm the intended configuration. Keep the native files together with **Pack and Go**. Export a second copy via **File → Save As → STEP**, using **Solid/Surface geometry** and AP242 when available. Use a named chassis coordinate system, and report its axes and units. [SolidWorks STEP export settings](https://help.solidworks.com/2025/english/SolidWorks/sldworks/HIDD_EXPORT_OPTION_STEP.htm)

For the first suspension sweep, record the wheel centers, inner and outer arm pivots, upright and tie-rod joints, and damper mounts in that same coordinate system. Use a CSV with `axle,side,point,x_mm,y_mm,z_mm`. Keep editable dimensions/mates and the hardpoint values with the native assembly. The STL files in this folder are display meshes. 

Both meshes were generated with Open Cascade 7.6.3 using the [converter](../scripts/step-to-stl.cpp) and 3 mm linear deflection.

## Test-cell emblem

The test-cell wall displays the 2D emblem of the Department of Automotive Transport at Zhytomyr Agrotechnical Professional College. The app uses `public/department.png` from `My_books/Automobile/new/Images/department-hazards-off.png`.

The `model3-side.png`, `model3-front.png` and `model3-top.png` report figures are orthographic views of the aligned Ameer Studio mesh with the simulator’s assembled wheels. Report dimensions come from the Tesla manual.
