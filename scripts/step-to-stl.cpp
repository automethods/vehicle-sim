#include <BRepBndLib.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <Bnd_Box.hxx>
#include <STEPControl_Reader.hxx>
#include <StlAPI_Writer.hxx>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
  if (argc != 3) return 2;
  try {
    STEPControl_Reader reader;
    if (reader.ReadFile(argv[1]) != IFSelect_RetDone || reader.TransferRoots() == 0) {
      throw std::runtime_error("STEP import failed");
    }
    const auto shape = reader.OneShape();
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(shape, bounds, false, false);
    BRepMesh_IncrementalMesh mesh(shape, 3.0, false, 0.45, true);
    if (!mesh.IsDone()) throw std::runtime_error("Tessellation failed");
    double x0, y0, z0, x1, y1, z1;
    bounds.Get(x0, y0, z0, x1, y1, z1);
    std::cout << "Bounds (mm): " << x0 << "," << y0 << "," << z0 << " to " << x1 << "," << y1 << "," << z1 << "\n";
    StlAPI_Writer writer;
    writer.ASCIIMode() = false;
    if (!writer.Write(shape, argv[2])) throw std::runtime_error("STL export failed");
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
}
