from src.models.ingredient import Ingredient, Restriction  # noqa: F401, E261, E501


# Req 1
def test_ingredient():
    resultLasanha= Ingredient('massa de lasanha')

    assert resultLasanha.name == 'massa de lasanha'
    assert resultLasanha == Ingredient('massa de lasanha')

    assert hash(resultLasanha) == hash('massa de lasanha')

    assert Restriction.GLUTEN in resultLasanha.restrictions
    assert Restriction.LACTOSE in resultLasanha.restrictions

    assert repr(resultLasanha) == "Ingredient('massa de lasanha')"
